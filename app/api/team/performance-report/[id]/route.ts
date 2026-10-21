import { savedPerformanceReport } from '@/lib/team/performance-access';
import { TeamError } from '@/lib/team/policy';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
  try {
    const { report, id } = await savedPerformanceReport(Number((await params).id));
    return Response.json(report, { headers: { ...headers, 'Content-Disposition': `attachment; filename="hymn-performance-${id}.json"` } });
  } catch (error) {
    return Response.json({ error: 'Report unavailable.' }, { status: error instanceof TeamError ? error.status : 503, headers });
  }
}
