import { prisma } from "@/lib/prisma";

export async function growthReport(since: Date, until: Date) {
  const groups = await prisma.$queryRaw<Array<{ campaign: string; visitors: number; signups: number; starts: number; submissions: number; live: number; second: number; subscribers: number; renewals: number; paying: number; revenue: number }>>`
    SELECT COALESCE(e.campaign, 'Unknown / Direct') AS campaign,
      COUNT(DISTINCT CASE WHEN e.source = 'client' THEN e.visitor_id END)::int AS visitors,
      COUNT(DISTINCT CASE WHEN e.event = 'signup_completed' AND e.source = 'server' THEN e.user_id END)::int AS signups,
      COUNT(*) FILTER (WHERE e.event = 'release_started' AND e.source = 'server')::int AS starts,
      COUNT(*) FILTER (WHERE e.event = 'release_submitted' AND e.source = 'server')::int AS submissions,
      COUNT(*) FILTER (WHERE e.event = 'release_live' AND e.source = 'server')::int AS live,
      COUNT(DISTINCT CASE WHEN e.event = 'second_release_started' AND e.source = 'server' AND u.created_at >= ${since} THEN e.user_id END)::int AS second,
      COUNT(DISTINCT CASE WHEN e.event = 'plan_purchased' AND e.source = 'server' THEN e.user_id END)::int AS subscribers,
      COUNT(*) FILTER (WHERE e.event = 'plan_renewed' AND e.source = 'server')::int AS renewals,
      COUNT(DISTINCT CASE WHEN e.event = 'payment_success' AND e.source = 'server' THEN e.user_id END)::int AS paying,
      COALESCE(SUM(CASE WHEN e.event = 'payment_success' AND e.source = 'server' AND e.properties->>'currency' = 'INR' THEN (e.properties->>'amount_cents')::numeric ELSE 0 END), 0)::float AS revenue
    FROM growth_events e LEFT JOIN users u ON e.user_id = u.id WHERE e.created_at >= ${since} AND e.created_at < ${until}
    AND e.event NOT LIKE '%observation_completed' GROUP BY e.campaign ORDER BY campaign`;
  const spend = await prisma.campaignSpend.groupBy({ by: ["campaignId"], where: { spentAt: { gte: since, lt: until } }, _sum: { amountCents: true } });
  const campaigns = await prisma.marketingCampaign.findMany({ select: { id: true, slug: true } });
  const amounts = new Map(campaigns.map(campaign => [campaign.slug, spend.find(row => row.campaignId === campaign.id)?._sum.amountCents || 0]));
  const rows = [...new Set([...groups.map(row => row.campaign), ...amounts.keys()])].map(campaign => ({ ...(groups.find(row => row.campaign === campaign) || { campaign, visitors: 0, signups: 0, starts: 0, submissions: 0, live: 0, second: 0, subscribers: 0, renewals: 0, paying: 0, revenue: 0 }), spend: amounts.get(campaign) || 0 }));
  return rows;
}
