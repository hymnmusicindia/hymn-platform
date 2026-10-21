import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { TeamError } from '@/lib/team/policy';
import { savedPerformanceReport } from '@/lib/team/performance-access';
import { TeamPerformanceReport } from '@/components/team/performance-report';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saved performance report · HYMN Team OS', robots: { index: false, follow: false } };
export default async function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await getSession()) redirect(`/login?next=${encodeURIComponent(`/team/performance/${id}`)}`);
  const result = await savedPerformanceReport(Number(id)).catch(error => { if (error instanceof TeamError) notFound(); throw error; });
  return <TeamPerformanceReport report={result.report} snapshot><Link href={`/api/team/performance-report/${result.id}`}>Download report as JSON</Link></TeamPerformanceReport>;
}
