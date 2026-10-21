import { notFound,redirect } from 'next/navigation';
import { releaseQcAccess } from '@/lib/release-qc-access';
import { readReleaseQcReport } from '@/lib/direnote-qc-store';
import { ReleaseQcReportView } from '@/components/release-qc-report';
export const dynamic='force-dynamic';
export default async function QcReportPage({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  const access=await releaseQcAccess(id);
  if('error' in access){if(access.error.status===401)redirect(`/login?next=${encodeURIComponent(`/dashboard/releases/${id}/qc-report`)}`);notFound();}
  return <ReleaseQcReportView release={access.release} report={await readReleaseQcReport(access.release.id)}/>;
}
