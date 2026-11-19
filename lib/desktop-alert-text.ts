import {customerBrandText} from './customer-message';
export function desktopBrief(value:string,limit=180,preserveNames:readonly string[]=[]){
  const names=[...new Set(preserveNames.filter(Boolean))].sort((a,b)=>b.length-a.length);let prefix='__HYMN_NAME_';while(value.includes(prefix))prefix+='_';
  let text=customerBrandText(value,preserveNames);
  const pattern=names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  if(pattern)text=text.replace(new RegExp(pattern,'g'),name=>`${prefix}${names.indexOf(name)}__`);
  text=text.replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/gi,'[link]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/(?<![\w-])(?:\+\d[\d ()-]{7,}\d|\b\d{10,15}\b|\b\d{5}[ -]\d{5}\b)(?![\w-])/g,'[number]').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  names.forEach((name,index)=>{text=text.replaceAll(`${prefix}${index}__`,name);});return text.slice(0,limit);
}
export const desktopReleaseLabels:Record<string,string>={SUBMITTED:'Submitted',RESUBMITTED:'Corrections submitted',UNDER_REVIEW:'QC required',IN_QC_QUEUE:'QC required',CHANGES_REQUESTED:'Correction requested',DISTRIBUTOR_CHANGES_REQUIRED:'Correction requested',APPROVED:'Approved by HYMN',SENT_TO_DISTRIBUTOR:'Sent for distribution',SCHEDULED:'Scheduled',LIVE:'Live',REJECTED:'Rejected',FAILED:'Submission failed',DELIVERY_FAILED:'Delivery failed',TAKEN_DOWN:'Taken down'};
export function desktopReleaseAlert(row:{id:number;releaseId:number;createdAt:Date;newStatus:string;reason?:string|null;release:{title:string;artistName:string;artworkUrl?:string|null}}){
  const release=row.release,label=desktopReleaseLabels[row.newStatus]??'Status updated',names=[release.title,release.artistName];
  return {key:`submission:${row.id}`,category:'distribution',title:desktopBrief(`${release.title} · ${label}`,150,names),body:desktopBrief(`${release.artistName} — ${row.reason||label+'. Open the release for its current review and delivery details.'}`,260,names),href:`/admin?tab=releases&releaseId=${row.releaseId}`,imageUrl:release.artworkUrl?`/api/desktop/artwork?releaseId=${row.releaseId}`:null,at:row.createdAt.toISOString()};
}
