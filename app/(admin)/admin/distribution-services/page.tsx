import Link from 'next/link';
import { requireAdminPermission,getAdminAccessForPage } from '@/lib/access';
import { DistributionServiceAdmin } from '@/components/distribution-service-admin';
import { DistributionAnalyticsPanel } from '@/components/distribution-insights-panel';
export default async function Page(){
  const auth=await requireAdminPermission('releases.read');if('error'in auth)return <main className="surface-card">Distribution review permission is required.</main>;
  const access=await getAdminAccessForPage();
  return <main className="admin-panel-shell mx-auto grid max-w-6xl gap-6 py-6"><header className="surface-card"><h1 className="text-3xl font-semibold">Distribution services</h1><p className="mt-2">Review artist profile, claims, video, collection and takedown requests, and monitor signed events.</p><Link className="btn-outline mt-4" href="/admin/integrations/direnote">Integration monitor</Link></header><DistributionServiceAdmin permissions={access?.permissions||[]}/>{access?.permissions.includes('royalties.reconcile')?<DistributionAnalyticsPanel releaseId={0} admin/>:null}</main>;
}
