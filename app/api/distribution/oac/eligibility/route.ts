import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {refreshOacEligibility,oacAccessState} from '@/lib/youtube-oac-access';
import {isSameAppOrigin} from '@/lib/request-origin';
import {z} from 'zod';
import {oacArtistLiveSongCount} from '@/lib/oac-artist-releases';
import {object} from '@/lib/distribution-services-contract';
export async function GET(){
 const auth=await requireUser();if('error' in auth)return auth.error;
 await refreshOacEligibility(auth.user.id);
 const notices=await prisma.notification.findMany({where:{userId:auth.user.id,type:'oac_eligible',readAt:null},orderBy:{id:'asc'},select:{id:true,title:true,body:true,href:true,metadata:true},take:200});
 let notification=null;
 for(const notice of notices){
   const artistId=Number(object(notice.metadata).artistId);
   if(!Number.isSafeInteger(artistId))continue;
   const artist=await prisma.artistCard.findFirst({where:{id:artistId,userId:auth.user.id,archivedAt:null,user:{status:'ACTIVE'}}});
   if(!artist || !/^[1-9]\d*$/.test(artist.direNoteArtistId||'') || !Number.isSafeInteger(Number(artist.direNoteArtistId)) || !(await oacAccessState(auth.user.id,artistId)).owned || await oacArtistLiveSongCount(auth.user.id,artistId)<5)continue;
   if(await prisma.releaseChangeRequest.count({where:{requestedByUserId:auth.user.id,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artistId}`}}}))continue;
   const {metadata,...visible}=notice;notification=visible;break;
 }
 return NextResponse.json({notification},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 const auth=await requireUser();if('error' in auth)return auth.error;
 const input=z.object({id:z.number().int().positive()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid notification.'},{status:400});
 await prisma.notification.updateMany({where:{id:input.data.id,userId:auth.user.id,type:'oac_eligible'},data:{readAt:new Date()}});
 return NextResponse.json({success:true});
}
