import {NextResponse} from 'next/server';
import {requireAdminPermission} from '@/lib/access';
import {requestBeatSampleAgreement} from '@/lib/email/beat-sample-requests';
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requireAdminPermission('users.manage');if('error'in actor)return actor.error;
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Invalid beat.'},{status:400});
 try{const task=await requestBeatSampleAgreement(id);return NextResponse.json({status:task.status,queued:task.status==='open'});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not request agreement.'},{status:400});}
}
