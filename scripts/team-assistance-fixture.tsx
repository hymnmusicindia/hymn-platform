import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeamAssistance } from '../components/team/assistance';
import { TeamContacts } from '../components/team/contacts';
import { CrmPipeline } from '../components/team/crm-pipeline';
const fixture = window as typeof window & { guideViewer?: boolean; writes: { resource: string; body: unknown }[] };
fixture.writes = [];
const api = async <T,>(resource: string, body?: unknown): Promise<T> => {
  if (body) fixture.writes.push({ resource, body });
  return (resource.startsWith('client-account-match') ? { accounts: [] } : { items: [], total: 0 }) as T;
};
const leads = [
  { id: 'lead', researcher: { user: { name: 'Researcher' } }, prospect: { id: 'p', name: 'New Artist', stage: 'NEEDS_RESEARCH', phone: '+919876543210', version: 1, notes: '' } },
  { id: 'ready', researcher: { user: { name: 'Researcher' } }, acquisitionEmployeeId: 'me', prospect: { id: 'p2', name: 'Ready Artist', stage: 'READY_TO_CONTACT', verified: true, contactEligibility: 'LEGITIMATE_INTEREST', phone: '+919876543210', version: 1, notes: '' } },
];
function App() {
  const [module, setModule] = React.useState('contacts');
  return <><main data-dashboard-main>{module === 'contacts'
    ? <TeamContacts api={api} actor={{ id: 'me', owner: true, permissions: [] }} onNavigate={setModule}/>
    : module === 'acquisition'
      ? <CrmPipeline leads={leads} api={api} refresh={async () => {}} admin={false} canEdit={true} canCreate={true} employeeId="me" onAdd={() => setModule('contacts')}/>
      : <div data-team-guide={module === 'availability' ? 'availability' : 'customer-calls'}>Assigned work</div>}
  </main><TeamAssistance navigate={setModule} owner={!fixture.guideViewer} permissions={[]}/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
