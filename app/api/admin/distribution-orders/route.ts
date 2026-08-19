import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAllDistributionOrders } from "@/lib/distribution-db";

export async function GET() {
  const result = await requireAdminPermission("distribution.confirm_status");
  if ("error" in result) return result.error;

  const orders = await listAllDistributionOrders();
  return NextResponse.json({ orders });
}

// vercel trigger 9
