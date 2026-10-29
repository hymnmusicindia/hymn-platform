import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getCurrentUserForPage} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {BeatSampleUpload} from '@/components/beat-sample-upload';
export const dynamic='force-dynamic';
export default async function SampleAgreementPage({params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUserForPage();if(!user)redirect('/login');
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
 const beat=await prisma.beat.findFirst({where:{id,userId:user.id},select:{id:true,title:true}});if(!beat)notFound();
 return <main className="shell max-w-3xl py-8"><Link className="text-sm text-[var(--text-muted)]" href="/producer/dashboard?tab=catalog">← Producer catalogue</Link><header className="my-6"><p className="hymn-kicker">Sample rights review</p><h1 className="mt-2 text-3xl font-semibold">{beat.title}</h1><p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Upload the Splice or other sample-provider certificate and describe the samples used. HYMN will check permissions before publishing. Sampled beats are available for non-exclusive licensing only. The supplied agreement will be available privately to licensed buyers.</p></header><BeatSampleUpload beatId={beat.id} defaultOpen/></main>;
}
