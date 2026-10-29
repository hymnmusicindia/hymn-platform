"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BellRing, CalendarClock, ClipboardList, PhoneCall, RefreshCw, Users } from 'lucide-react';
import styles from './leadership-activity.module.css';

type Item = { id: string; at: string; action: string; title: string; category: string; actor: { id: string; name: string }; automatic: boolean; subject: string; isUpdate: boolean; fields: { label: string; value: string }[]; links: { label: string; href: string }[] };
type Feed = { items: Item[]; latestId: string | null; nextCursor: string | null; snapshot: string; from: string; total: number; summary: { callReports: number; contactsAdded: number; workUpdates: number; contributors: number }; members: { id: string; name: string; status: string; updates: number }[] };
type Api = <T>(resource: string, body?: unknown, options?: { signal?: AbortSignal }) => Promise<T>;
const categories = [['all', 'All updates'], ['calls', 'Calls & reports'], ['contacts', 'Contacts'], ['leads', 'Leads & outreach'], ['work', 'Work & projects'], ['schedule', 'Schedule'], ['reports', 'Weekly reports'], ['team', 'Team & access'], ['other', 'Other activity']];
const format = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST';
const day = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' });
const prettyValue = (field: { label: string; value: string }) => /time \(IST\)|follow-up/i.test(field.label) && !Number.isNaN(Date.parse(field.value)) ? format(field.value) : field.value;

export function LeadershipActivity({ api }: { api: Api }) {
  const [days, setDays] = useState('7'), [category, setCategory] = useState('all'), [member, setMember] = useState('');
  const [data, setData] = useState<Feed | null>(null), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [error, setError] = useState(''), [newUpdates, setNewUpdates] = useState(false), [connection, setConnection] = useState(''), [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [members, setMembers] = useState<Feed['members']>([]);
  const generation = useRef(0), newest = useRef<string | null>(null), loadMoreBusy = useRef(false);
  const query = new URLSearchParams({ days, category, member }).toString();
  useEffect(() => {
    const request = ++generation.current, controller = new AbortController();
    setLoading(true); setError(''); setData(null); setExpanded([]); setNewUpdates(false); setMore(false); loadMoreBusy.current = false;
    void api<Feed>(`leadership-activity?${query}`, undefined, { signal: controller.signal }).then(result => {
      if (generation.current !== request) return;
      setData(result); setMembers(result.members); newest.current = result.latestId; setConnection('');
    }).catch(cause => { if (!controller.signal.aborted && generation.current === request) setError(cause instanceof Error ? cause.message : 'Team updates are unavailable.'); }).finally(() => { if (generation.current === request) setLoading(false); });
    return () => controller.abort();
  }, [api, query, revision]);
  useEffect(() => {
    if (!data) return;
    let live = true, pending = false;
    const check = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try { const head = await api<{ latestId: string | null }>(`leadership-activity?${query}&mode=head`); if (live) { setNewUpdates(Boolean(head.latestId && head.latestId !== newest.current)); setConnection(''); } }
      catch { if (live) setConnection('Live check paused. Your loaded updates are still available; refresh to retry.'); }
      finally { pending = false; }
    };
    const timer = setInterval(() => void check(), 30000);
    document.addEventListener('visibilitychange', check);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [api, query, Boolean(data)]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  async function loadMore() {
    if (!data?.nextCursor || loadMoreBusy.current) return;
    const request = generation.current; loadMoreBusy.current = true; setMore(true); setError('');
    try {
      const result = await api<Feed>(`leadership-activity?${query}&snapshot=${encodeURIComponent(data.snapshot)}&cursor=${encodeURIComponent(data.nextCursor)}`);
      if (generation.current === request) setData(previous => previous ? { ...previous, nextCursor: result.nextCursor, items: [...previous.items, ...result.items.filter(item => !previous.items.some(old => old.id === item.id))] } : previous);
    } catch (cause) { if (generation.current === request) setError(cause instanceof Error ? cause.message : 'Could not load earlier updates.'); }
    finally { if (generation.current === request) { loadMoreBusy.current = false; setMore(false); } }
  }
  return <section className={styles.root} data-team-guide="leadership-updates" aria-label="Leadership team updates">
    <header className={styles.heading}><div><span className={styles.eyebrow}><Activity size={14}/>LEADERSHIP</span><h2>Your team, in view.</h2><p>Who did what, for which customer, and what comes next.</p></div><button type="button" onClick={refresh} disabled={loading}><RefreshCw size={15}/>{loading ? 'Refreshing...' : 'Refresh updates'}</button></header>
    <div className={styles.filters} data-team-guide="leadership-filters"><label>Period<select aria-label="Period" value={days} onChange={event => setDays(event.target.value)}><option value="1">Today (IST)</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All recorded activity</option></select></label><label>Team member<select aria-label="Team member" value={member} onChange={event => setMember(event.target.value)}><option value="">Everyone</option>{members.map(person => <option key={person.id} value={person.id}>{person.name}{person.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}</select></label><label>Activity<select aria-label="Activity" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>{(days !== '7' || member || category !== 'all') && <button type="button" onClick={() => { setDays('7'); setCategory('all'); setMember(''); }}>Reset filters</button>}</div>
    {data && <><div className={styles.metrics}>{[[PhoneCall, 'Call reports saved', data.summary.callReports], [Users, 'Contacts added', data.summary.contactsAdded], [ClipboardList, 'Work updates', data.summary.workUpdates], [Activity, 'Contributors', data.summary.contributors]].map(([Icon, title, count]) => { const MetricIcon = Icon as typeof Activity; return <article key={String(title)}><MetricIcon size={17}/><span>{String(title)}</span><strong>{String(count)}</strong></article>; })}</div><p className={styles.caption}>Counts follow the selected filters and recorded save time. Updates and automated routing are activity records, not a measure of employee performance.</p></>}
    {newUpdates && <button type="button" className={styles.newUpdates} onClick={refresh}><BellRing size={17}/>New team updates available <span>Show latest</span></button>}
    {connection && <p role="status" className={styles.warning}>{connection}</p>}
    {error && <p role="alert" className={styles.warning}>{error} <button type="button" disabled={loading} onClick={data?.nextCursor ? () => void loadMore() : refresh}>Retry</button></p>}
    {loading && <div className={styles.empty} role="status">Loading recorded team updates...</div>}
    {data && <div className={styles.layout}><div className={styles.feed} data-team-guide="leadership-feed"><header className={styles.feedHeading}><h3>Activity timeline</h3><small>{data.items.length} of {data.total} updates · newest first</small></header>
      {!data.items.length && <div className={styles.empty}><CalendarClock size={25}/><h3>No updates in this view</h3><p>Try another period or team member. New reports and recorded changes will appear here.</p></div>}
      {data.items.map((item, index) => <div key={item.id}>{(!index || day(data.items[index - 1].at) !== day(item.at)) && <h4 className={styles.day}>{day(item.at)}</h4>}<article className={styles.event} aria-label={`${item.actor.name}: ${item.title}`}><div className={styles.avatar} aria-hidden="true">{item.actor.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</div><div className={styles.eventBody}><header><strong>{item.actor.name}</strong><time dateTime={item.at}>{format(item.at)}</time></header><h3>{item.title}{item.isUpdate && <span className={styles.tag}>Report update</span>}</h3>{item.automatic && <p className={styles.caption}>Automated action · triggered in this member's workspace session</p>}{item.subject && <p className={styles.subject}>{item.subject}</p>}{item.fields.find(field => field.label === 'Discussion' || field.label === 'Work update') && <p className={styles.preview}>{item.fields.find(field => field.label === 'Discussion' || field.label === 'Work update')!.value}</p>}
        <div className={styles.actions}>{item.fields.length > 0 && <button type="button" aria-expanded={expanded.includes(item.id)} aria-controls={`activity-${item.id}`} onClick={() => setExpanded(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])}>{expanded.includes(item.id) ? 'Hide details' : item.action === 'contact.call_report' ? 'Read call report' : 'View update'}</button>}{item.links.map(link => <a key={link.href} href={link.href}>{link.label}<ArrowUpRight size={14}/></a>)}</div>
        {expanded.includes(item.id) && <dl id={`activity-${item.id}`} className={styles.details}>{item.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{prettyValue(field)}</dd></div>)}</dl>}
      </div></article></div>)}
      {data.nextCursor && <button type="button" className={styles.loadMore} onClick={() => void loadMore()} disabled={more}>{more ? 'Loading earlier updates...' : 'Load earlier updates'}</button>}
    </div><aside className={styles.people}><h3>Team at a glance</h3><p>Recorded updates in this view. Select a person to focus the timeline.</p>{data.members.filter(person => person.updates > 0 || person.status === 'ACTIVE').map(person => <button type="button" key={person.id} aria-pressed={member === person.id} onClick={() => setMember(previous => previous === person.id ? '' : person.id)}><span>{person.name}<small>{person.status === 'ACTIVE' ? 'Team member' : 'Inactive membership'}</small></span><strong>{person.updates}</strong></button>)}<small>Private chat content is excluded. Historical records without an audit event cannot be attributed reliably.</small></aside></div>}
  </section>;
}
