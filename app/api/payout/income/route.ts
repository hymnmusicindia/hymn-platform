import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getIncomeSummary } from "@/lib/income-summary";
export async function GET(){const auth=await requireUser();if("error" in auth)return auth.error;return NextResponse.json(await getIncomeSummary(auth.user.id),{headers:{"Cache-Control":"private, no-store"}});}
