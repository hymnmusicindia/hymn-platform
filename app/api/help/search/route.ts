import { NextResponse } from "next/server";
import { searchHelpArticles } from "@/lib/help-articles";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ query, results: searchHelpArticles(query), createTicketHref: `/contact?category=${encodeURIComponent(query || "general")}` });
}
