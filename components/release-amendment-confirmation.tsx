import Link from 'next/link';
import { amendmentStatusCopy, amendmentStatusLabel } from '@/lib/release-amendment-presentation';

export function ReleaseAmendmentConfirmation({ releaseId, title, request }: { releaseId: number; title: string; request: { id: number; status: string; existing?: boolean } }) {
  return <section className="py-10" role="status" aria-label="Amendment confirmation">
    <p className="text-sm font-semibold">{request.existing ? 'Your earlier amendment was received' : 'Amendment submitted successfully'}</p>
    <h1 className="mt-3 text-3xl font-semibold">{amendmentStatusLabel(request.status)}</h1>
    <p className="mt-3">{title} | Request #{request.id}</p>
    <p className="mt-3 max-w-2xl text-sm">{amendmentStatusCopy(request.status)} {request.existing ? 'This existing request is still active. No additional amendment has been created.' : 'A confirmation email and an account notification are queued. You can track every update below.'}</p>
    <div className="mt-6 flex flex-wrap gap-4"><Link className="btn-primary" href={`/dashboard/releases/${releaseId}?tab=requests&request=${request.id}`}>View amendment details</Link><Link className="btn-outline" href="/dashboard/releases">Back to my releases</Link></div>
  </section>;
}
