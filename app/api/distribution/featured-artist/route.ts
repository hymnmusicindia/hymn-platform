import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { consumeRateLimit } from "@/lib/rate-limit";
import { resolveFeaturedArtistName } from "@/lib/featured-artist-requirements";
import { isDireNoteRateLimit } from "@/lib/direnote-rate-limit";

export const maxDuration = 120;

const schema = z.object({name:z.string().trim().min(1).max(150).refine(name=>!/[\r\n,]/.test(name),"Add one featured artist at a time.")}).strict();
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const payload = schema.safeParse(await request.json().catch(()=>null));
  if (!payload.success) return NextResponse.json({error:"Enter one featured artist name, up to 150 characters."},{status:400});
  const limit = await consumeRateLimit({scope:"featured-artist-match",identity:String(auth.user.id),limit:20,windowSeconds:3600});
  if (!limit.allowed) return NextResponse.json({error:"Too many artist checks. Please try again later."},{status:429,headers:{"Retry-After":String(limit.retryAfterSeconds)}});
  try { return NextResponse.json({name:payload.data.name,match:await resolveFeaturedArtistName(payload.data.name)}); }
  catch (error) {
    if (isDireNoteRateLimit(error)) return NextResponse.json({error:"Artist verification is temporarily busy. Try again later, or add an artist profile with Instagram."},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}});
    return NextResponse.json({error:"HYMN could not verify this artist name. Try again, or create an artist profile with Instagram."},{status:503});
  }
}
