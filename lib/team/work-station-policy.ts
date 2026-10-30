export const WORK_STATION_ALIASES = ['work', 'tasks', 'customer-calls', 'release-qc', 'tasktools'];
export const workStationModule = (key: string) => WORK_STATION_ALIASES.includes(key) ? 'work-station' : key;
export const ACTIVITY_OUTCOMES = { COMPLETED: 'Task completed', FOLLOW_UP: 'Follow-up needed', NO_ANSWER: 'Call not picked up', BUSY: 'Customer busy', WRONG_NUMBER: 'Wrong number', DO_NOT_CONTACT: 'Do not contact', BLOCKED: 'Need help / blocked' } as const;
export type ActivityOutcome = keyof typeof ACTIVITY_OUTCOMES;
export type ActivityDraft = {
    notes: string;
    needs: string;
    commitments: string;
    nextAction: string;
    services: string[];
    checklist: boolean[];
};
export type WorkActivity = ActivityDraft & {
    id: string;
    kind: 'CALL' | 'TASK' | 'SUPPORT' | 'QC';
    memberId: string;
    startedAt: string;
    lastSavedAt: string;
    status: 'RUNNING' | 'PAUSED' | 'FINISHED';
    pausedAt?: string;
    pausedMs: number;
    clientInterests?: string[];
    endedAt?: string;
    outcome?: ActivityOutcome;
};
export function activitySeconds(activity: WorkActivity, now = Date.now()) { const end = Date.parse(activity.pausedAt || activity.endedAt || '') || now; return Math.max(0, Math.floor((end - Date.parse(activity.startedAt) - activity.pausedMs) / 1000)); }
export function workActivity(context: unknown): WorkActivity | null { const value = context && typeof context === 'object' ? (context as {
    workActivity?: WorkActivity;
}).workActivity : null; return value?.id && value.startedAt ? value : null; }
export const activityOpen = (context: unknown) => { const a = workActivity(context); return !!a && a.status !== 'FINISHED'; };
export function retryDisposition(attempts: number, hasSlot: boolean) { return attempts >= 3 ? 'REVIEW' : hasSlot ? 'SCHEDULED' : 'NEEDS_COVERAGE'; }
export const MISSED_EMAIL_GAP_MS = 2 * 60 * 60 * 1000;
export const activityEmailTemplates = {
    'phone-request': { subject: 'A phone number for your HYMN callback', body: 'We would like to help with your callback request, but do not have a usable phone number. Please reply with your phone number including country code, preferred time and timezone. We will confirm an available slot.' },
    solution: { subject: 'Your HYMN support update', body: 'Thank you for contacting HYMN.\n\n[Add the actual solution and next steps here.]\n\nPlease reply if you need further assistance.' },
    'missed-call': { subject: 'We tried calling you from HYMN', body: 'We tried calling you but could not connect. Please reply with a convenient time and timezone. Any suggested retry is an internal plan; we will confirm an appointment with you.' }
} as const;
