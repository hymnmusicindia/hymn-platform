import { after,NextResponse } from 'next/server';
import { receiveDistributionWebhook,processDistributionWebhookQueue } from '@/lib/distribution-webhooks';
export const runtime='nodejs';
export async function POST(request:Request){
  if(!process.env.DNM_WEBHOOK_SECRET && !process.env.DIRENOTE_WEBHOOK_SECRET)return NextResponse.json({error:'Webhook signing is not configured.'},{status:503});
  const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:'Missing body.'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024){await reader.cancel();return NextResponse.json({error:'Payload too large.'},{status:413});}chunks.push(value);}
  try{const result=await receiveDistributionWebhook(Buffer.concat(chunks),request.headers);after(async()=>{await processDistributionWebhookQueue().catch(()=>undefined);});return NextResponse.json({received:true,duplicate:result.duplicate});}
  catch{return NextResponse.json({error:'Invalid or conflicting webhook.'},{status:400});}
}
