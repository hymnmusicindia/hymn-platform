import 'server-only';
import { Prisma, type TeamClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { demand, type Actor } from './policy';
import { contactPhoneKey, publicContact } from './contact-directory';

/** Small, read-only identity lookup. Never imports accounts, counts the directory or loads mail jobs. */
export async function lookupContacts(a:Actor, params:URLSearchParams) {
  demand(a,'clients.view');
  const query=(params.get('q')||'').trim().replace(/\s+/g,' ').slice(0,160).toLowerCase();
  if(query.length<2)return {items:[]};
  const phone=/^[+\d\s().-]+$/.test(query);
  const digits=query.replace(/\D/g,'').replace(/^00/,'');
  if(phone&&digits.length<4)return {items:[]};
  const needle=phone?contactPhoneKey(query):query.replace(/^@/,'');
  if(!needle)return {items:[]};
  const values=phone?Prisma.sql`SELECT CASE WHEN length(n)=10 THEN '91'||n ELSE n END AS value FROM (
    SELECT regexp_replace(regexp_replace(coalesce(raw,''),'[^0-9]','','g'),'^00','') AS n
    FROM unnest(array_append(array_prepend(c.phone,c."alternatePhones"),u.mobile)) AS p(raw)
  ) normalized`:Prisma.sql`SELECT lower(coalesce(raw,'')) AS value FROM unnest(
    array_cat(ARRAY[c.name,u.name,h.tag,c.email,c."secondaryEmail",u.email,u.contact_email],c."additionalEmails")
  ) AS names(raw)`;
  const match=phone&&digits.length>=10?Prisma.sql`v.value=${needle}`:Prisma.join(needle.split(' ').map(token=>Prisma.sql`strpos(v.value,${token})>0`),' AND ');
  const cards=await prisma.$queryRaw<TeamClient[]>(Prisma.sql`
    SELECT c.id,c."workspaceId",c."ownerId",c."userId",c.name,c.phone,c.email,c."secondaryEmail",
      c."additionalEmails",c."alternatePhones",c.interests,c.state,c.city,c.notes,c.status,c.version,
      c.merged_into_id AS "mergedIntoId",c."createdAt",c."updatedAt"
    FROM team_clients c
    LEFT JOIN users u ON u.id=c."userId"
    LEFT JOIN user_handles h ON h.user_id=u.id
    CROSS JOIN LATERAL (
      SELECT min(CASE WHEN v.value=${needle} THEN 0 WHEN starts_with(v.value,${needle}) THEN 1 ELSE 2 END)::int AS rank
      FROM (${values}) v WHERE ${match}
    ) hit
    WHERE c."workspaceId"=${a.workspaceId} AND c.status='ACTIVE' AND c.merged_into_id IS NULL AND hit.rank IS NOT NULL
    ORDER BY hit.rank,lower(c.name),c.id LIMIT 8
  `);
  return {items:cards.map(card=>publicContact(a,card))};
}
