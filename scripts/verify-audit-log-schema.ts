import { prisma } from "../lib/prisma";

async function main() {
  const [table] = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('public.audit_logs')::text AS name
  `;
  const [columns] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  `;
  const [indexes] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  `;
  const [triggers] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM pg_trigger
    WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal
  `;

  if (table?.name !== "audit_logs" || columns?.count !== 17 || indexes?.count < 7 || triggers?.count !== 2) {
    throw new Error(`Audit log schema is incomplete: ${JSON.stringify({ table: table?.name, columns: columns?.count, indexes: indexes?.count, triggers: triggers?.count })}`);
  }

  console.log(`Audit log schema verified: ${columns.count} columns, ${indexes.count} indexes, ${triggers.count} append-only triggers.`);
}

main().finally(() => prisma.$disconnect());
