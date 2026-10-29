import Link from 'next/link';
import {ArrowLeft,ArrowUpRight,Download,Headphones,ScanLine} from 'lucide-react';
import {LicenceCycleActions} from './licence-cycle-actions';
import s from './licence-toolbar.module.css';

export function LicenceToolbar({purchaseId,studioOrderId,releaseId,pdfUrl,readOnly=false}:{purchaseId:number;studioOrderId?:string|null;releaseId?:number|null;pdfUrl?:string|null;readOnly?:boolean}){
 return <nav className={s.toolbar} aria-label="Licence actions">
  <Link href={readOnly?'/beat-store':'/dashboard/purchases'} className={`${s.button} ${s.back}`}><ArrowLeft aria-hidden="true"/>{readOnly?'Beatstore':'Purchases'}</Link>
  <div className={s.actions}>
   {!readOnly&&<><Link href={studioOrderId?`/studio/orders/${studioOrderId}`:`/studio?beatPurchaseId=${purchaseId}`} className={s.button}><Headphones aria-hidden="true"/>{studioOrderId?'Studio project':'Mix & master'}</Link>
   <Link href={`/studio/readiness?beatPurchaseId=${purchaseId}`} className={s.button}><ScanLine aria-hidden="true"/>Free readiness check</Link>
   {releaseId?<Link href={`/distribution/start?edit=${releaseId}`} className={`${s.button} ${s.primary}`}>Continue release<ArrowUpRight aria-hidden="true"/></Link>:<LicenceCycleActions purchaseId={purchaseId}/>}</>}
   {pdfUrl?<a href={pdfUrl} download className={s.button}><Download aria-hidden="true"/>Download PDF</a>:null}
  </div>
 </nav>;
}
