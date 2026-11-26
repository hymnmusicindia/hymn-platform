import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsPlanning } from '../components/team/operations-planning';
import { TeamGlobalSearch } from '../components/team/global-search';
import { capacity, planning } from '../lib/team/operations-policy';
const state = window as typeof window & { writes: unknown[]; fail: boolean }; state.writes = []; state.fail = false;
const members = ['Aaditya', 'Khushi', 'Manha'].map((name, index) => ({ id: String(index), name, avatar: null, role: 'Team Member', owner: false, department: index === 2 ? 'Marketplace' : 'Operations', jobTitle: index === 2 ? 'Creator operations' : 'Artist operations', availability: 'AVAILABLE', active: true, permissions: ['tasks.update'], config: { ...planning({}), weeklyHours: 20 }, configVersion: 'fixture', hours: 0, missing: 0, available: 20, capacity: capacity(0, 0, 20, { near: 80, overloaded: 100 }) }));
const tasks = ['Prepare artist onboarding', 'Review marketplace assets', 'Coordinate release preparation'].map((title, index) => ({ id: `task-${index}`, title, ownerId: String(index), creatorId: 'owner', status: index === 1 ? 'BLOCKED' : 'TODO', priority: index === 2 ? 'HIGH' : 'NORMAL', dueAt: index === 1 ? new Date(Date.now() - 86400000).toISOString() : new Date(Date.now() + 86400000).toISOString(), version: 1, remainingHours: index === 2 ? null : 3, kind: 'tasks', module: 'work-station', locked: false, project: null, projectId: null, projectMemberIds: [], dependencyIds: [], recordType: null, recordId: null, blocker: index === 1 ? 'Waiting for licence details' : '', completedAt: null, createdAt: new Date().toISOString() }));
const api = async <T,>(resource: string, body?: any): Promise<T> => {
  if (body) {
    state.writes.push({ resource, body }); if (state.fail) throw new Error('Task changed. Refresh and review the plan.');
    if (resource === 'operations-delegate') return { items: body.changes.map((change: any) => { const task = tasks.find(task => task.id === change.id)!; const previousOwnerId = task.ownerId; task.ownerId = change.ownerId; task.version++; return { ...change, previousOwnerId, version: task.version }; }) } as T;
    if (resource === 'operations-estimate') { const task = tasks.find(task => task.id === body.id)!; task.remainingHours = body.remainingHours; task.version++; }
    return { saved: true } as T;
  }
  if (resource.startsWith('team-search')) return { items: [] } as T;
  return JSON.parse(JSON.stringify({ items: tasks, members, total: tasks.length, complete: true, days: 7, now: new Date().toISOString(), end: new Date(Date.now() + 7 * 86400000).toISOString(), approvals: 2, unassignedIntakes: 1, pipeline: [], recent: [{ id: 'capacity', action: 'operations.capacity', entityId: '0', createdAt: new Date().toISOString() }] })) as T;
};
createRoot(document.getElementById('root')!).render(<><TeamGlobalSearch api={api} commands={[{ id: 'owner-operations', kind: 'command', title: 'Operations centre', detail: 'Owner workspace', href: '#operations' }]} onCreateTask={() => { state.writes.push('create-task'); }}/><OperationsPlanning api={api} workspaceId="fixture"/></>);
