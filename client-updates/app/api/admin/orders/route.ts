import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAllOrders } from "@/lib/db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const orders = await listAllOrders();
  return NextResponse.json({ orders });
}

