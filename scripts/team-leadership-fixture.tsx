import React from 'react';
import { createRoot } from 'react-dom/client';
import { LeadershipActivity } from '../components/team/leadership-activity';
const state = window as typeof window & { activityRequests: string[]; newActivity: boolean; failHead: boolean; failMore: boolean; activityWrites: number };
state.activityRequests = []; state.newActivity = false; state.failHead = false; state.failMore = false; state.activityWrites = 0;
const base = [
  { id: 'report', at: '2026-10-29T08:45:00.000Z', action: 'contact.call_report', title: 'Saved a call report', category: 'calls', actor: { id: 'kira', name: 'Kira' }, automatic: false, subject: 'Customer One', isUpdate: false, fields: [{ label: 'Discussion', value: 'Discussed distribution and agreed the next release steps.' }, { label: 'Customer needs', value: 'Release assistance' }, { label: 'Next action', value: 'Kira will review the artwork on Friday.' }, { label: 'Call time (IST)', value: '2026-10-28T08:45:00.000Z' }], links: [{ label: 'Open contact & reports', href: '/team?workspace=fixture&module=contacts&client=customer-one' }] },
  { id: 'contact', at: '2026-10-29T07:45:00.000Z', action: 'client.created', title: 'Added a contact', category: 'contacts', actor: { id: 'tavish', name: 'Tavish' }, automatic: false, subject: 'Customer Two', isUpdate: false, fields: [], links: [{ label: 'Open contact & reports', href: '/team?workspace=fixture&module=contacts&client=customer-two' }] },
  { id: 'work', at: '2026-10-28T07:45:00.000Z', action: 'task.comment_added', title: 'Added a work update', category: 'work', actor: { id: 'kira', name: 'Kira' }, automatic: false, subject: 'Customer One', isUpdate: false, fields: [{ label: 'Work update', value: 'Customer has confirmed their release date.' }], links: [{ label: 'Open work history', href: '/team?workspace=fixture&module=work&task=task-one' }] },
];
const api = async <T,>(resource: string, body?: unknown): Promise<T> => {
  state.activityRequests.push(resource); if (body) state.activityWrites++;
  const params = new URLSearchParams(resource.split('?')[1]);
  if (params.get('mode') === 'head') { if (state.failHead) throw new Error('Offline fixture'); return { latestId: state.newActivity ? 'latest' : 'report' } as T; }
  if (params.has('cursor') && state.failMore) throw new Error('Could not load earlier updates.');
  let items = state.newActivity ? [{ ...base[0], id: 'latest', title: 'Saved another call report' }, ...base] : [...base];
  if (params.get('member')) items = items.filter(row => row.actor.id === params.get('member'));
  if (params.get('category') && params.get('category') !== 'all') items = items.filter(row => row.category === params.get('category'));
  const total = items.length, offset = params.has('cursor') ? 2 : 0;
  return { items: items.slice(offset, offset + 2), latestId: items[0]?.id || null, nextCursor: total > offset + 2 ? 'next' : null, snapshot: '2026-10-29T09:00:00.000Z', from: '2026-10-22T18:30:00.000Z', total, summary: { callReports: items.filter(row => row.category === 'calls').length, contactsAdded: items.filter(row => row.category === 'contacts').length, workUpdates: items.filter(row => row.category === 'work').length, contributors: new Set(items.map(row => row.actor.id)).size }, members: [{ id: 'kira', name: 'Kira', status: 'ACTIVE', updates: items.filter(row => row.actor.id === 'kira').length }, { id: 'tavish', name: 'Tavish', status: 'ACTIVE', updates: items.filter(row => row.actor.id === 'tavish').length }] } as T;
};
createRoot(document.getElementById('root')!).render(<LeadershipActivity api={api}/>);
