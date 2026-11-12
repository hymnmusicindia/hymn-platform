import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getPayoutCredential, savePayoutCredential } from "@/lib/payout/credentials";
import { z } from 'zod';
const credentialInput = z.object({ method: z.enum(['BANK', 'UPI']), legalName: z.string().trim().min(2).max(200), country: z.string().trim().length(2), taxResidency: z.string().trim().max(200).optional(), upiId: z.string().trim().max(200).optional(), accountHolderName: z.string().trim().max(200).optional(), bankAccountNumber: z.string().trim().max(40).optional(), ifsc: z.string().trim().max(20).optional(), taxInfo: z.string().trim().max(200).optional() }).strict();

export const runtime = "nodejs";
export async function GET() { const auth = await requireUser(); if ("error" in auth) return auth.error; return NextResponse.json({ credential: await getPayoutCredential(auth.user.id) }); }
async function save(request: Request) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { const body = credentialInput.parse(await request.json()); return NextResponse.json({ credential: await savePayoutCredential(auth.user.id, { method: body.method === "BANK" ? "BANK" : "UPI", legalName: body.legalName, country: body.country, taxResidency: body.taxResidency, upiId: body.upiId, accountHolderName: body.accountHolderName, bankAccountNumber: body.bankAccountNumber, ifsc: body.ifsc, taxInfo: body.taxInfo }) }); } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "Check your payout method and identity details." : error instanceof Error ? error.message : "Could not save payout details." }, { status: 400 }); } }
export const POST = save; export const PATCH = save;
// vercel trigger 9
