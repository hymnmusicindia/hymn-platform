import { after, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { acceptPartnership } from "@/lib/partnerships";
import { deliverPartnershipMail } from "@/lib/partnership-mail";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { referralJson } from "@/lib/referral-request";

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  const origin=request.headers.get("origin");
  if(!origin||![new URL(request.url).origin,new URL(getPublicAppUrl()).origin].includes(origin)||request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"Please activate from the HYMN website."},{status:403});
  const session=await getSession();if(!session)return NextResponse.json({error:"Please sign in to the invited account before activating."},{status:401});
  const rate=await consumeRateLimit({scope:"partnership-activation",identity:String(session.sub),limit:15,windowSeconds:300});
  if(!rate.allowed)return NextResponse.json({error:"Please wait a few minutes before trying again."},{status:429,headers:{"Retry-After":String(rate.retryAfterSeconds)}});
  if(Number(request.headers.get("content-length")||0)>1000)return NextResponse.json({error:"Invalid request."},{status:413});
  try{
    const body=await referralJson(request,1000);
    if(!body||typeof body!=="object"||!("accepted" in body)||body.accepted!==true||Object.keys(body).length!==1)return NextResponse.json({error:"Please confirm that you accept the agreement."},{status:400});
    const {token}=await params;
    const invitation=await acceptPartnership(token,session.sub,{ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")||undefined});
    after(()=>deliverPartnershipMail().then(()=>undefined));
    return NextResponse.json({activated:true,expiresAt:invitation.subscriptionExpiresAt},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){const message=error instanceof Error?error.message:"";const safe=/^(This invitation|Please sign in|This account already|The agreement has changed|Your existing subscription)/.test(message);return NextResponse.json({error:safe?message:"Activation could not be confirmed. Please retry; your benefits will not be duplicated."},{status:safe?409:503});}
}
