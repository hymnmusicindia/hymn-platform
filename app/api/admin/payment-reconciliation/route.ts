import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { reconcilePayments } from "@/lib/payment-reconciliation";
export async function GET() { const admin = await requireAdminPermission("payouts.review"); if ("error" in admin) return admin.error; return NextResponse.json(await reconcilePayments()); }
// vercel trigger 9
