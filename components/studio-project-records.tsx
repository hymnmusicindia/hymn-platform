"use client";
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {WorkspaceRecords} from './workspace-records';
import s from './marketplace-operations.module.css';
export type StudioProjectRow={id:string;title:string;customer:string;email:string;engineer:string;status:string;payment:string;updatedAt:string;beatLinked:boolean};
export function StudioProjectRecords({orders}:{orders:StudioProjectRow[]}){
 const [filter,setFilter]=useState('attention');const router=useRouter();
 const rows=orders.filter(order=>filter==='all'||filter==='attention'&&!['COMPLETED','CANCELLED','REFUNDED'].includes(order.status)||filter===order.status);
 return <section className="surface-card min-w-0 p-4 sm:p-6"><header className={s.refresh}><div><h2>Studio projects</h2><p>Latest updates first. Open a project for its files, messages, delivery and payment history.</p></div><button className={s.action} onClick={()=>router.refresh()}>Refresh</button></header><WorkspaceRecords rows={rows} rowKey={order=>order.id} searchText={order=>`${order.title} ${order.customer} ${order.email} ${order.engineer} ${order.id}`} noun="projects" initialSort="updated" searchPlaceholder="Find a project, customer or engineer" actions={<select className="field" value={filter} aria-label="Studio project status" onChange={event=>setFilter(event.target.value)}><option value="attention">Active & needs attention</option><option value="all">All projects</option>{[...new Set(orders.map(order=>order.status))].sort().map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select>} columns={[
 {key:'project',label:'Project',primary:true,render:order=><><Link href={`/admin/studio/orders/${order.id}`} className="font-semibold">{order.title}</Link><small>{order.beatLinked?'HYMN Beat project':'External production'} · #{order.id.slice(0,8)}</small></>},
 {key:'customer',label:'Customer',render:order=><><span>{order.customer}</span><small>{order.email}</small></>},
 {key:'engineer',label:'Engineer',render:order=>order.engineer},
 {key:'status',label:'Progress',render:order=><><span className="status-pill">{order.status.replaceAll('_',' ')}</span><small>Payment: {order.payment.replaceAll('_',' ')}</small></>},
 {key:'updated',label:'Updated',value:order=>Date.parse(order.updatedAt),render:order=>new Date(order.updatedAt).toLocaleDateString('en-IN')},
 {key:'open',label:'Details',render:order=><Link className={s.action} href={`/admin/studio/orders/${order.id}`}>Open project →</Link>}
 ]}/></section>;
}
