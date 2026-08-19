import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAllOrders } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("payouts.review");
  if ("error" in result) return result.error;

  const orders = await listAllOrders();
  return NextResponse.json({ orders });
}

// vercel trigger 9
