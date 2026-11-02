export const ARTIST_GOALS = { FIRST_RELEASE: 'Release my first single', FIND_BEAT: 'Find the right beat', FINISH_MIX: 'Finish my mix', RELEASE_MUSIC: 'Distribute my music', PROMOTE: 'Promote my release', EXPLORING: 'Explore HYMN' } as const;
export type ArtistGoal = keyof typeof ARTIST_GOALS;
export type JourneyPreferences = {
    revision: number;
    goal: ArtistGoal;
    mode: 'EXPLORING' | 'ACTIVE' | 'LATER';
    contact: 'ASK_FIRST' | 'CALL' | 'MESSAGE' | 'NONE';
    analytics: boolean;
    timezone: string;
    startHour: number;
    endHour: number;
    weekdays: number[];
    after: string | null;
    deadline: string | null;
    notes: string;
    shortlist: number[];
    contactChangedAt?: string | null;
};
export const defaultJourney: JourneyPreferences = { revision: 0, goal: 'EXPLORING', mode: 'EXPLORING', contact: 'ASK_FIRST', analytics: false, timezone: 'Asia/Kolkata', startHour: 10, endHour: 18, weekdays: [1, 2, 3, 4, 5, 6], after: null, deadline: null, notes: '', shortlist: [] };
export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function journeyPreferences(value: unknown): JourneyPreferences {
    const p = object(value);
    let timezone = defaultJourney.timezone;
    try {
        if (typeof p.timezone === 'string') {
            new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format();
            timezone = p.timezone;
        }
    }
    catch { }
    return { ...defaultJourney, revision: Number.isInteger(p.revision) ? Number(p.revision) : 0, goal: String(p.goal) in ARTIST_GOALS ? p.goal as ArtistGoal : 'EXPLORING', mode: ['EXPLORING', 'ACTIVE', 'LATER'].includes(String(p.mode)) ? p.mode as JourneyPreferences['mode'] : 'EXPLORING', contact: ['ASK_FIRST', 'CALL', 'MESSAGE', 'NONE'].includes(String(p.contact)) ? p.contact as JourneyPreferences['contact'] : 'ASK_FIRST', analytics: p.analytics === true, timezone, startHour: typeof p.startHour === 'number' && p.startHour >= 8 && p.startHour <= 20 ? p.startHour : 10, endHour: typeof p.endHour === 'number' && p.endHour <= 21 && p.endHour > Number(p.startHour ?? 10) ? p.endHour : 18, weekdays: Array.isArray(p.weekdays) ? p.weekdays.filter((n): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 6) : [1, 2, 3, 4, 5, 6], after: typeof p.after === 'string' && Number.isFinite(Date.parse(p.after)) ? p.after : null, deadline: typeof p.deadline === 'string' && Number.isFinite(Date.parse(p.deadline)) ? p.deadline : null, notes: typeof p.notes === 'string' ? p.notes.slice(0, 1000) : '', shortlist: Array.isArray(p.shortlist) ? [...new Set(p.shortlist.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))].slice(0, 5) : [] };
}
export function customerCallWindow(p: JourneyPreferences, at: Date) {
    if (p.contact !== 'CALL' || p.mode === 'LATER' && (!p.after || at < new Date(p.after)) || p.after && at < new Date(p.after))
        return false;
    const f = new Intl.DateTimeFormat('en-US', { timeZone: p.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const get = (key: string) => f.find(v => v.type === key)?.value || '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), minute = Number(get('hour')) * 60 + Number(get('minute'));
    return p.weekdays.includes(day) && minute >= p.startHour * 60 && minute + 30 <= p.endHour * 60;
}
export type ListenRecord = {
    beatId: number;
    seconds: number;
    uniqueSeconds: number;
    duration: number;
    sessions: number;
    lastAt: string;
    title?: string;
    genre?: string;
    bpm?: number;
};
export function nextCustomerWindow(p: JourneyPreferences, after: Date) { const start = Math.ceil(after.getTime() / 900000) * 900000; for (let step = 0; step < 14 * 96; step++) {
    const at = new Date(start + step * 900000);
    if (customerCallWindow(p, at))
        return at;
} return null; }
export type IntentSignal = {
    key: string;
    label: string;
    points: number;
    observedAt: string;
    kind: 'OBSERVED' | 'REQUESTED';
    service: string;
};
export function intentScore(signals: IntentSignal[], now = new Date()) {
    const families = new Map<string, IntentSignal>();
    for (const item of signals) {
        const age = Math.max(0, (now.getTime() - Date.parse(item.observedAt)) / 86400000);
        if (!Number.isFinite(age) || age > 14)
            continue;
        const points = Math.round(item.points * (age > 7 ? .25 : age > 3 ? .5 : 1));
        const next = { ...item, points };
        if (points > (families.get(item.key)?.points || 0))
            families.set(item.key, next);
    }
    const reasons = [...families.values()].filter(s => s.points > 0).sort((a, b) => b.points - a.points);
    return { score: Math.min(100, reasons.reduce((n, s) => n + s.points, 0)), reasons, level: reasons.some(s => s.kind === 'REQUESTED') ? 'REQUESTED' : reasons.reduce((n, s) => n + s.points, 0) >= 50 ? 'HIGH' : 'EXPLORING' };
}
export function mergedSegments(input: [
    number,
    number
][], duration: number): [
    number,
    number
][] {
    const result: [
        number,
        number
    ][] = [];
    for (const [start, end] of input.map(([a, b]) => [Math.max(0, a), Math.min(duration, b)] as [
        number,
        number
    ]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
        const last = result[result.length - 1];
        if (last && start <= last[1] + .15)
            last[1] = Math.max(end, last[1]);
        else
            result.push([start, end]);
    }
    return result.slice(-240);
}
export function meaningfulListen(record: ListenRecord) { return record.uniqueSeconds >= Math.min(30, record.duration * .5) && record.duration >= 10; }
export function experimentGroup(userId: number) { return userId % 20 === 0 ? 'COMPARISON' : 'ASSISTED'; }
export function journeyRequestActive(context: unknown, p: JourneyPreferences) { const c = object(context); if (c.kind === 'SUPPORT_CALLBACK')
    return true; if (!c.helpRequestId)
    return false; return !p.contactChangedAt || !!c.helpRequestedAt && Date.parse(String(c.helpRequestedAt)) >= Date.parse(p.contactChangedAt); }
export const JOURNEY_LINKS = { beats: '/beat-store', releases: '/dashboard/releases', studio: '/dashboard/studio', help: '/artist-journey' } as const;
