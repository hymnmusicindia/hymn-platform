import { NextResponse } from "next/server";
import { getProducerLinkData } from "@/lib/producer-link-data";

export async function GET(request: Request, context: { params: Promise<{ slug:string }> }) {
  const offset=Number(new URL(request.url).searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({error:"Invalid beat offset."},{status:400});
  const data=await getProducerLinkData((await context.params).slug);
  if (!data) return NextResponse.json({error:"Producer not found."},{status:404});
  return NextResponse.json({beats:data.beats.slice(offset,offset+6),total:data.beats.length},{headers:{"Cache-Control":"no-store"}});
}
