import React from 'react';
import { createRoot } from 'react-dom/client';
import { CallReport } from '../components/team/call-report';
import { TeamAssistance } from '../components/team/assistance';
const state = window as typeof window & { writes: unknown[] };
state.writes = [];
let items: unknown[] = [{id:'report-existing',createdAt:new Date().toISOString(),occurredAt:'2026-10-01T08:45:00.000Z',authorName:'Kira',outcome:'TALKED',source:'PERSONAL_PHONE',discussion:'Discussed customer needs and agreed release next steps.'}];
const api = async <T,>(resource: string, body?: unknown): Promise<T> => {
  if (body) { state.writes.push(body); items.unshift({ ...body as object, id: 'report-' + items.length, createdAt: new Date().toISOString(), authorName: 'Kira' }); return { id: 'saved' } as T; }
  return { items, total: items.length, canWrite: true, contact: { name: 'Customer', phone: '+919876543210', email: 'customer@fixture.invalid' } } as T;
};
createRoot(document.getElementById('root')!).render(<><main data-dashboard-main><label data-team-guide="contact-search">Search contacts<input/></label><CallReport api={api} clientId="contact" name="Customer"/></main><TeamAssistance navigate={() => {}} owner={true} permissions={[]}/></>);
