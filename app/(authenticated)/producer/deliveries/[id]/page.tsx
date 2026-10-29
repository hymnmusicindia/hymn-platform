import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getCurrentUserForPage} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {ProducerRequestedFile} from '@/components/producer-requested-file';
export const dynamic='force-dynamic';
export default async function RequestedFilePage({params}:{params:Promise<{id:string}>}){const user=await getCurrentUserForPage();if(!user)redirect('/login');const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();const purchase=await prisma.beatPurchase.findFirst({where:{id,hasAccess:true,beat:{userId:user.id}},include:{beat:{select:{title:true}}}});if(!purchase)notFound();return <main className="shell max-w-3xl py-8"><Link href="/producer/deliveries" className="text-sm text-[var(--text-muted)]">← Requested files</Link><p className="hymn-kicker mt-6">BUYER DELIVERY</p><h1 className="mt-2 text-3xl font-semibold">{purchase.beat.title}</h1><ProducerRequestedFile purchaseId={id} title={purchase.beat.title} format={purchase.licenseType}/></main>;}
