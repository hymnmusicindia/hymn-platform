import { timingSafeEqual } from "node:crypto";
import { sendEngineerBookingReminders } from "@/lib/email/engineer-booking-reminder";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { return Response.json(await sendEngineerBookingReminders(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Engineer reminders could not complete. Inspect email logs." }, { status: 503 }); }
}
