"use client";
import { useEffect, useState } from "react";
export function GrowthReminderPreference() {
  const [enabled, setEnabled] = useState(false); const [ready, setReady] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/growth/preferences").then(response => response.ok ? response.json() : null).then(value => { if (value) { setEnabled(value.reminders); setReady(true); } }).catch(() => undefined); }, []);
  return <div className="border-t p-5"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={!ready} onChange={async event => { const reminders = event.target.checked; setReady(false); try { const response = await fetch("/api/growth/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminders }) }); if (!response.ok) throw new Error(); setEnabled(reminders); setMessage("Preference saved."); } catch { setMessage("Could not save. Please try again."); } finally { setReady(true); } }} />Remind me in my HYMN dashboard when it may be time to plan another release. You can turn this off anytime.</label><p className="mt-2 text-sm" role="status">{message}</p></div>;
}
