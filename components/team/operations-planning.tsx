'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, GripVertical, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { capacity } from '@/lib/team/operations-policy';
import type { readOperations } from '@/lib/team/operations';
import styles from './operations-planning.module.css';

type Snapshot = Awaited<ReturnType<typeof readOperations>>;
type Task = Snapshot['items'][number];
type Member = Snapshot['members'][number];
type Change = { id: string; version: number; ownerId: string };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
const open = (task: Task) => !['COMPLETED', 'CANCELLED'].includes(task.status);
const human = (text: string) => text.toLowerCase().replaceAll('_', ' ');
const hours = (value: number) => `${Number(value.toFixed(1))}h`;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : 'No deadline';

export function OperationsPlanning({ api, workspaceId }: { api: Api; workspaceId: string }) {
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [period, setPeriod] = useState('7'), [query, setQuery] = useState(''), [department, setDepartment] = useState(''), [filter, setFilter] = useState('open');
  const [mode, setMode] = useState('board'), [busy, setBusy] = useState(false), [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [plan, setPlan] = useState<Record<string, Change>>({}), [note, setNote] = useState('');
  const [undo, setUndo] = useState<Change[]>([]), [drag, setDrag] = useState<string[]>([]), [destination, setDestination] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null), [memberId, setMemberId] = useState<string | null>(null);
  const detail = useRef<HTMLDialogElement>(null), settings = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const changes = Object.values(plan); pending.current = changes.length > 0 || busy;
  const load = useCallback(async () => {
    const result = await api<Snapshot>(`operations-planning?period=${period}`);
    setData(result); setStale(false); setError('');
  }, [api, period]);
  useEffect(() => { let cancelled = false; api<Snapshot>(`operations-planning?period=${period}`).then(result => { if (!cancelled) { setData(result); setError(''); } }).catch(e => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [api, period]);
  useEffect(() => {
    const refresh = () => { if (document.hidden) return; if (pending.current) { setStale(true); return; } void load().catch(() => setStale(true)); };
    const timer = window.setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  useEffect(() => { if (taskId) detail.current?.showModal(); else detail.current?.close(); }, [taskId]);
  useEffect(() => { if (memberId) settings.current?.showModal(); else settings.current?.close(); }, [memberId]);
  const roster = data?.members ?? [];
  const tasks = useMemo(() => data?.items ?? [], [data]);
  const current = tasks.find(task => task.id === taskId), member = roster.find(item => item.id === memberId);
  const counts = useMemo(() => ({ open: tasks.filter(open).length, overdue: tasks.filter(task => open(task) && task.dueAt && new Date(task.dueAt) < new Date(data?.now ?? Date.now())).length, blocked: tasks.filter(task => task.status === 'BLOCKED').length, completed: tasks.filter(task => task.status === 'COMPLETED').length, active: tasks.filter(task => task.status === 'IN_PROGRESS').length }), [tasks, data?.now]);
  const visible = tasks.filter(task => {
    const owner = roster.find(item => item.id === (plan[task.id]?.ownerId ?? task.ownerId));
    return (!department || owner?.department === department) && `${task.title} ${task.project ?? ''} ${owner?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'open' ? open(task) : filter === 'overdue' ? open(task) && !!task.dueAt && new Date(task.dueAt) < new Date(data?.now ?? Date.now()) : filter === 'blocked' ? task.status === 'BLOCKED' : filter === 'completed' ? task.status === 'COMPLETED' : task.status === 'IN_PROGRESS');
  });
  function compatible(task: Task, target: Member) {
    const permission: Record<string, string> = { release: 'operations.distribution.review', beat: 'operations.beats.manage', engineer: 'operations.engineers.manage', studio: 'operations.studio.review', support: 'support.reply' };
    return !task.locked && task.kind !== 'calls' && target.active && !target.owner && target.availability === 'AVAILABLE' && target.permissions.includes('tasks.update') && (!task.projectId || task.projectMemberIds.includes(target.id)) && (!task.recordType || !permission[task.recordType] || target.permissions.includes(permission[task.recordType]));
  }
  function stage(ids: string[], ownerId: string) {
    const target = roster.find(item => item.id === ownerId), chosen = tasks.filter(task => ids.includes(task.id));
    if (!target || !chosen.length) return;
    if (chosen.some(task => task.ownerId !== ownerId && !compatible(task, target))) { setError('Choose an available, authorised project member. Calls and scheduled work use their existing handoff workflow.'); return; }
    setPlan(previous => { const next = { ...previous }; for (const task of chosen) { if (task.ownerId === ownerId) delete next[task.id]; else next[task.id] = { id: task.id, version: task.version, ownerId }; } return next; });
    setError(''); setNotice('Plan updated. Review projected capacity, then apply. Nothing has been reassigned yet.'); setDrag([]);
  }
  function projection(target: Member) {
    const relevant = tasks.filter(task => open(task) && (!task.dueAt || new Date(task.dueAt) <= new Date(data!.end)) && (plan[task.id]?.ownerId ?? task.ownerId) === target.id);
    const total = relevant.reduce((sum, task) => sum + (task.remainingHours ?? 0), 0), missing = relevant.filter(task => task.remainingHours === null).length;
    return { hours: total, missing, ...capacity(total, missing + (data?.complete ? 0 : 1), target.available, target.config) };
  }
  async function apply(revert = false) {
    setBusy(true); setError('');
    try {
      const result = await api<{ items: { id: string; version: number; previousOwnerId: string }[] }>('operations-delegate', { changes: revert ? undo : changes, note: revert ? 'Undo previous operational reassignment.' : note });
      setUndo(revert ? [] : result.items.filter(item => changes.find(change => change.id === item.id)?.ownerId !== item.previousOwnerId).map(item => ({ id: item.id, version: item.version, ownerId: item.previousOwnerId })));
      setPlan({}); setSelected([]); setNote(''); setNotice(revert ? 'Reassignment undone.' : `${result.items.length} task(s) reassigned. History and contributions retained.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not apply changes.'); setStale(true); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>, resource: string, body: Record<string, unknown>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(resource, body); setNotice('Planning information saved.'); setMemberId(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); } finally { setBusy(false); }
  }
  function card(task: Task) {
    return <article key={task.id} className={`${styles.task} ${plan[task.id] ? styles.proposed : ''}`} draggable={!task.locked && task.kind !== 'calls' && !busy} onDragStart={event => { const ids = selected.includes(task.id) ? selected : [task.id]; setDrag(ids); event.dataTransfer.setData('application/x-hymn-task', JSON.stringify(ids)); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDrag([])}>
      <div className={styles.taskTop}><label><input type="checkbox" aria-label={`Select ${task.title}`} checked={selected.includes(task.id)} disabled={task.locked || task.kind === 'calls' || busy} onChange={event => setSelected(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))}/><span className={styles.badge}>{human(task.priority)}</span></label><GripVertical size={14} aria-hidden="true"/></div>
      <button className={styles.title} onClick={() => setTaskId(task.id)}>{task.title}</button>
      <p>{task.project ?? (task.kind === 'calls' ? 'Call workflow' : task.recordType ? `${task.recordType} operations` : 'Internal work')}</p>
      <footer><span>{human(task.status)}</span><span>{task.remainingHours === null ? 'Estimate missing' : hours(task.remainingHours)}</span></footer><small>{date(task.dueAt)}{plan[task.id] ? ' / Proposed transfer' : ''}{task.locked ? ' / Locked' : ''}</small>
    </article>;
  }
  if (!data) return <section className={styles.root} aria-busy={!error}>{error ? <p role="alert">{error}<button onClick={() => void load().catch(e => setError(e.message))}>Retry</button></p> : <p role="status">Loading operational workload...</p>}</section>;
  return <section className={styles.root} aria-label="Owner operations command centre">
    <header className={styles.heading}><div><span className={styles.eyebrow}>HYMN / OWNER OPERATIONS</span><h1>Make room for the work that matters.</h1><p>Plan capacity. Delegate clearly. Keep every handoff connected.</p></div><button disabled={busy || !!changes.length} onClick={() => void load().catch(e => setError(e.message))}><RefreshCw size={15}/> Refresh</button></header>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {!data.complete ? <p role="alert">Showing the first 5,000 of {data.total} tasks. Counts and capacity below are partial; precise utilisation is unavailable.</p> : null}
    {stale ? <p className={styles.notice}>Newer work may be available. Applying revalidates each task. Reset the plan and refresh to review the latest records.</p> : null}
    <div className={styles.metrics}>{([['open', 'Outstanding', counts.open], ['active', 'In progress', counts.active], ['overdue', 'Overdue', counts.overdue], ['blocked', 'Blocked', counts.blocked], ['completed', `Completed / last ${period} days`, counts.completed]] as const).map(([key, title, count]) => <button key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setMode('board'); }}><span>{title}</span><strong>{count}</strong><ArrowRight size={15}/></button>)}</div>
    <div className={styles.links}><a href={`/team?workspace=${workspaceId}&module=approvals`}>{data.approvals} pending task reviews <ArrowRight size={14}/></a><a href={`/team?workspace=${workspaceId}&module=overview`}>{data.unassignedIntakes} intake requests without tasks <ArrowRight size={14}/></a><a href={`/team?workspace=${workspaceId}&module=acquisition`}>Acquisition pipeline / {data.pipeline.reduce((sum, stage) => sum + stage._count, 0)} prospects <ArrowRight size={14}/></a></div>
    <div className={styles.toolbar}><div className={styles.tabs}><button aria-pressed={mode === 'board'} onClick={() => setMode('board')}>Workload</button><button aria-pressed={mode === 'attention'} onClick={() => setMode('attention')}>Attention inbox</button><button aria-pressed={mode === 'activity'} onClick={() => setMode('activity')}>Activity</button></div><label className={styles.search}><Search size={15}/><input aria-label="Search operational work" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search work, people, projects"/></label><select aria-label="Department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set(roster.map(item => item.department))].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Planning horizon" disabled={!!changes.length || busy} value={period} onChange={event => setPeriod(event.target.value)}><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select></div>
    {mode === 'board' ? <>
      <div className={styles.bulk}><span>{selected.length} selected / {changes.length} proposed transfers</span><select aria-label="Assign selected tasks to" value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}><option value="">Choose a teammate</option>{roster.filter(item => item.active && !item.owner).map(item => <option key={item.id} value={item.id} disabled={item.availability !== 'AVAILABLE'}>{item.name} / {human(item.availability)}</option>)}</select><button disabled={!selected.length || !destination || busy} onClick={() => stage(selected, destination)}>Preview assignment</button><button disabled={!changes.length || busy} onClick={() => { setPlan({}); setNotice('Plan reset. No assignments changed.'); }}>Reset plan</button></div>
      {changes.length ? <aside className={styles.plan} aria-label="Assignment preview"><div><strong>Review before applying</strong><p>{changes.length} task(s). Original versions will be checked together; a conflict cancels the entire batch.</p>{changes.map(change => <p key={change.id}>{tasks.find(task => task.id === change.id)?.title} <ArrowRight size={12}/> {roster.find(item => item.id === change.ownerId)?.name}<button aria-label={`Remove proposed transfer ${tasks.find(task => task.id === change.id)?.title}`} onClick={() => setPlan(previous => { const next = { ...previous }; delete next[change.id]; return next; })}><X size={12}/></button></p>)}</div><label>Handoff note<textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} placeholder="Pending actions, blockers and what comes next"/></label><button className={styles.primary} disabled={busy} onClick={() => void apply()}>Apply validated plan <ArrowRight size={15}/></button></aside> : null}
      {undo.length && !changes.length ? <button disabled={busy} onClick={() => void apply(true)}><Undo2 size={14}/> Undo last reassignment</button> : null}
      <p className={styles.help}>Drag cards onto a teammate, or select tasks and use Preview assignment. Capacity covers all open work due within the horizon, including overdue and undated tasks. Calls retain their dedicated handoff process.</p>
      <div className={styles.board}>{roster.filter(item => (!department || item.department === department) && (item.active || tasks.some(task => task.ownerId === item.id))).map(target => {
        const projected = projection(target), list = visible.filter(task => (plan[task.id]?.ownerId ?? task.ownerId) === target.id), valid = drag.length > 0 && drag.every(id => { const task = tasks.find(task => task.id === id); return task && compatible(task, target); });
        return <section key={target.id} className={`${styles.lane} ${valid ? styles.drop : ''}`} aria-label={`${target.name} workload`} onDragOver={event => { if (valid) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { event.preventDefault(); if (valid) stage(drag, target.id); }}><header><div className={styles.person}>{target.avatar ? <img src={target.avatar} alt=""/> : <span aria-hidden="true">{target.name.slice(0, 1)}</span>}<div><h2>{target.name}</h2><p>{target.jobTitle}</p></div><button aria-label={`Configure capacity for ${target.name}`} onClick={() => setMemberId(target.id)}>Edit</button></div><div className={styles.capacity}><strong>{hours(projected.hours)}<span> / {target.available === null ? 'capacity missing' : hours(target.available)}</span></strong><span>{projected.percent === null ? projected.state : `${projected.percent}% / ${projected.state}`}</span>{projected.percent !== null ? <progress max={Math.max(100, projected.percent)} value={projected.percent} aria-label={`${target.name} capacity`} /> : null}<small>{projected.missing ? `${projected.missing} tasks need an estimate` : 'Remaining effort in planning horizon'} / {human(target.availability)}</small></div>{valid ? <p className={styles.notice}>Drop to preview {drag.length} task(s)</p> : null}</header><div className={styles.cards}>{list.slice(0, 50).map(card)}{list.length > 50 ? <p>Showing 50 of {list.length}. Refine search or open Tasks & operations.</p> : !list.length ? <p className={styles.empty}>No matching work.</p> : null}</div></section>;
      })}</div>
    </> : mode === 'attention' ? <div className={styles.attention}><h2>Exceptions that need a decision</h2><p>One entry per task, with its current blocker and deadline.</p>{tasks.filter(task => open(task) && (task.status === 'BLOCKED' || task.dueAt && new Date(task.dueAt) < new Date(data.now))).filter(task => `${task.title} ${task.blocker}`.toLowerCase().includes(query.toLowerCase()) && (!department || roster.find(member => member.id === task.ownerId)?.department === department)).map(task => <button key={task.id} onClick={() => setTaskId(task.id)}><div><strong>{task.title}</strong><p>{task.blocker || `Overdue since ${date(task.dueAt)}`}</p></div><span>{roster.find(item => item.id === task.ownerId)?.name}<ArrowRight size={14}/></span></button>)}{!counts.overdue && !counts.blocked ? <p>No overdue or blocked tasks.</p> : null}</div> : <div className={styles.attention}><h2>Recent operational changes</h2>{data.recent.map(event => <p key={event.id}><time>{date(event.createdAt.toString())}</time> / {human(event.action.replace('operations.', '').replace('task.', 'Task '))}<a href={`/team?workspace=${workspaceId}&module=${event.action === 'operations.capacity' ? 'directory' : 'work-station'}&task=${event.entityId}`}> Inspect record</a></p>)}<a href={`/team?workspace=${workspaceId}&module=audit`}>Open full audit history</a></div>}
    <dialog ref={detail} className={styles.drawer} aria-label="Operational task details" onCancel={() => setTaskId(null)}><button className={styles.close} aria-label="Close task details" onClick={() => setTaskId(null)}><X size={18}/></button>{current ? <><span className={styles.eyebrow}>{human(current.status)} / {human(current.priority)}</span><h2>{current.title}</h2><p>{roster.find(item => item.id === current.ownerId)?.name} / {date(current.dueAt)}</p>{current.blocker ? <p className={styles.error}>{current.blocker}</p> : null}<form key={`${current.id}-${current.version}`} onSubmit={event => { const value = new FormData(event.currentTarget).get('hours'); void save(event, 'operations-estimate', { id: current.id, version: current.version, remainingHours: value === '' ? null : Number(value) }); }}><label>Estimated remaining hours<input name="hours" type="number" min="0" max="10000" step="0.25" defaultValue={current.remainingHours ?? ''} disabled={current.locked}/></label><button disabled={busy || current.locked}>Save estimate</button></form><h3>Dependencies</h3>{current.dependencyIds.length ? current.dependencyIds.map(id => { const dependency = tasks.find(item => item.id === id); return <p key={id}>{dependency?.title ?? 'Dependency outside this planning window'} / {dependency ? human(dependency.status) : 'Inspect full task'}</p>; }) : <p>No prerequisites.</p>}<h3>Related work</h3><p>{current.project || 'No project'}{current.recordType ? ` / ${current.recordType} #${current.recordId}` : ''}</p><a className={styles.primary} href={`/team?workspace=${workspaceId}&module=${current.module}&task=${current.id}`}>Open task, history & files <ArrowRight size={15}/></a><p className={styles.help}>Changing responsibility preserves the creator, discussions, files and historical contribution. Estimates describe remaining work, never employee performance.</p></> : null}</dialog>
    <dialog ref={settings} className={styles.drawer} aria-label="Member capacity settings" onCancel={() => setMemberId(null)}><button className={styles.close} aria-label="Close capacity settings" onClick={() => setMemberId(null)}><X size={18}/></button>{member ? <><h2>{member.name}</h2><p>Configured planning capacity. Leave blank when unknown. A zero means no planned capacity.</p><form key={`${member.id}-${member.configVersion}`} onSubmit={event => { const values = new FormData(event.currentTarget); void save(event, 'operations-capacity', { id: member.id, version: member.configVersion, weeklyHours: values.get('hours') === '' ? null : Number(values.get('hours')), skills: String(values.get('skills')).split(',').map(value => value.trim()).filter(Boolean), near: Number(values.get('near')), overloaded: Number(values.get('overloaded')) }); }}><label>Available hours per week<input name="hours" type="number" min="0" max="168" step="0.25" defaultValue={member.config.weeklyHours ?? ''}/></label><label>Skills, separated by commas<input name="skills" defaultValue={member.config.skills.join(', ')}/></label><label>Near-capacity threshold (%)<input name="near" type="number" min="1" max="200" defaultValue={member.config.near}/></label><label>Overloaded above (%)<input name="overloaded" type="number" min="1" max="300" defaultValue={member.config.overloaded}/></label><button className={styles.primary} disabled={busy}>Save capacity</button></form><p className={styles.help}>This does not modify declared calendar hours, appointment availability, role permissions or call routing.</p></> : null}</dialog>
  </section>;
}
