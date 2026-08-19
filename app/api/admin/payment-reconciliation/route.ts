import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { reconcilePayments } from "@/lib/payment-reconciliation";
export async function GET() { const admin = await requireAdmin(); if ("error" in admin) return admin.error; return NextResponse.json(await reconcilePayments()); }
