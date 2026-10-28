const indiaOffset = 330 * 60000;
export function nextDayPlanWindow(now: Date) {
  const local = new Date(now.getTime() + indiaOffset);
  if (local.getUTCHours() < 21) return null;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1)).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+05:30`);
  return { day, start, end: new Date(start.getTime() + 86400000) };
}
export const planTime = (date: Date) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);
