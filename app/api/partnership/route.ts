import { NextResponse } from "next/server";
import { receiveGrowthLead } from "@/lib/growth-leads";

export async function POST(request: Request) {
  return receiveGrowthLead(request, "partner");
}


