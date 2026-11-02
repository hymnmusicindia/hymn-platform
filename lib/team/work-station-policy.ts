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
    followup: { subject: 'Your next steps with HYMN', body: 'Thank you for connecting with HYMN. Please reply with your current priority and any questions so we can help you choose the next step.' },
    distribution: { subject: 'Prepare your release with HYMN', body: 'To prepare your release, please have your final audio, cover artwork, artist details, track credits and rights or licence documents ready. Reply with your planned release date and any questions. Our team will confirm the requirements and next steps before submission.' },
    beats: { subject: 'Find the right beat with HYMN', body: 'Please share your preferred genre, mood, reference tracks and budget, along with any beat you are considering. Let us know how you plan to release the song so we can help clarify the available licence terms before you purchase.' },
    mixing: { subject: 'Your mixing and mastering enquiry', body: 'Please share your reference tracks, project requirements and preferred deadline. Let us know whether you need mixing, mastering or both. We will confirm file delivery instructions, scope, pricing and availability before work begins.' },
    'phone-request': { subject: 'A phone number for your HYMN callback', body: 'We would like to help with your callback request, but do not have a usable phone number. Please reply with your phone number including country code, preferred time and timezone. We will confirm an available slot.' },
    solution: { subject: 'Your HYMN support update', body: 'Thank you for contacting HYMN.\n\n[Add the actual solution and next steps here.]\n\nPlease reply if you need further assistance.' },
    'missed-call': { subject: 'We tried calling you from HYMN', body: 'We tried calling you but could not connect. Please reply with a convenient time and timezone. Any suggested retry is an internal plan; we will confirm an appointment with you.' }
} as const;
export const activityEmailLabels: Record<keyof typeof activityEmailTemplates, string> = {
    followup: 'Conversation follow-up', distribution: 'Distribution / release checklist', beats: 'Beat selection / licensing', mixing: 'Mixing and mastering requirements',
    'phone-request': 'Request callback phone number', solution: 'Solution / next steps', 'missed-call': 'Missed call'
};
