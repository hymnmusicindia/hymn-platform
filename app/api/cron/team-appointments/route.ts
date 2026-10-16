import { timingSafeEqual } from "node:crypto";
import { processAppointments } from "@/lib/team/appointments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { return Response.json({ messages: await processAppointments() }); }
  catch { return Response.json({ error: "Appointment queue unavailable; retry next minute." }, { status: 503 }); }
}
