export type CalendarView = 'month' | 'week' | 'day' | 'agenda';
export const calendarDay = (value: string | Date) => new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 10);
export function weekDays(day: string, single = false) {
  const date = new Date(`${day}T00:00:00Z`);
  if (!single) date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: single ? 1 : 7 }, (_, index) => new Date(date.getTime() + index * 86400000).toISOString().slice(0, 10));
}
export function moveCalendarDate(day: string, view: CalendarView, direction: number) {
  const date = new Date(`${day}T00:00:00Z`);
  if (view === 'month') { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction); }
  else date.setUTCDate(date.getUTCDate() + direction * (view === 'day' ? 1 : 7));
  return date.toISOString().slice(0, 10);
}
export function timedLayout<T extends { id: string; start: string; end: string | null }>(entries: T[], day: string) {
  const start = Date.parse(`${day}T00:00:00+05:30`), end = start + 86400000;
  const rows = entries.filter(e => Date.parse(e.start) < end && (e.end ? Date.parse(e.end) > start : Date.parse(e.start) >= start)).map(entry => {
    const from = Math.max(start, Date.parse(entry.start));
    return { entry, from, until: Math.min(end, Math.max(from + 30 * 60000, entry.end ? Date.parse(entry.end) : from + 30 * 60000)), column: 0, columns: 1 };
  }).sort((a, b) => a.from - b.from || b.until - a.until);
  let group: typeof rows = [], groupEnd = -1;
  const finish = () => { const columns = Math.max(1, ...group.map(r => r.column + 1)); group.forEach(r => { r.columns = columns; }); };
  for (const row of rows) {
    if (row.from >= groupEnd) { finish(); group = []; groupEnd = -1; }
    const used = new Set(group.filter(r => r.until > row.from).map(r => r.column));
    while (used.has(row.column)) row.column++;
    group.push(row); groupEnd = Math.max(groupEnd, row.until);
  }
  finish();
  return rows.map(row => ({ ...row, top: (row.from - start) / 3600000 * 56, height: (row.until - row.from) / 3600000 * 56 }));
}
