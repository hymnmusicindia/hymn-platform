import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { reconcileFinancialLedger } from "@/lib/financial-reconciliation";

export async function GET() {
  const admin = await requireAdminPermission("royalties.reconcile"); if ("error" in admin) return admin.error;
  return NextResponse.json(await reconcileFinancialLedger());
}
// vercel trigger 9
