"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, ChartNoAxesCombined, CircleHelp, CreditCard, Disc3, Folder, Gift, Headphones, House, Menu, Megaphone, Music2, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Users, Wallet, X } from 'lucide-react';
import { studioDestinations, studioTools } from '@/lib/studio-navigation';
import s from './hymn-studio.module.css';
import { HymnStudioLogo } from './hymn-studio-logo';

const icons = { home: House, folder: Folder, disc: Disc3, headphones: Headphones, sliders: SlidersHorizontal, chart: ChartNoAxesCombined, megaphone: Megaphone, shield: ShieldCheck, users: Users, wallet: Wallet, credit: CreditCard, gift: Gift, bell: Bell, settings: Settings2, help: CircleHelp, music: Music2, sparkles: Sparkles };
export function StudioIcon({ name }: { name: string }) { const Icon = icons[name as keyof typeof icons] || Music2; return <Icon size={18} strokeWidth={1.7}/>; }

type NavItem = { key: string; label: string; group?: string; href?: string; description?: string };
export function HymnStudioFrame<T extends string>({ children, workspaceKind, activeKey, navItems, onSelect, searchValue = '', onSearchChange, notificationCount = 0, onNotificationsClick, user, setupMode = false, newAction }: {
  children: ReactNode; workspaceKind?: string; activeKey: T; navItems: NavItem[]; onSelect: (key: T) => void;
  title?: string; eyebrow?: string; subtitle?: ReactNode; overviewSubtitle?: ReactNode; searchValue?: string; onSearchChange?: (value: string) => void; searchPlaceholder?: string; quickActions?: ReactNode; workspaceAction?: ReactNode; compactOverview?: boolean; setupMode?: boolean; newAction?: { label: string; onClick: () => void };
  onNotificationsClick?: () => void; notificationCount?: number; user?: { name: string; role: string };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finder, setFinder] = useState('');
  const finderInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const producer = workspaceKind === 'producer';
  const canProduce = user?.role === 'producer' || user?.role === 'admin';
  const items: NavItem[] = producer ? [...navItems.map(item => ({ ...item, group: item.group === 'Home' ? 'Workspace' : item.group || 'Producer tools' })), {key:'library',label:'My library',group:'Workspace',href:'/library'},{key:'deliveries',label:'Requested buyer files',group:'Beatstore',href:'/producer/deliveries'},{key:'engineer-tools',label:'Engineer workspace',group:'Mixing / Mastering',href:'/studio/engineer'}] : [...studioDestinations];
  const groups = Array.from(new Set(items.map(item => item.group)));
  const current = items.find(item => item.key === activeKey);
  useEffect(() => { if (finderOpen) finderInput.current?.focus(); }, [finderOpen]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setFinderOpen(value => !value); }
      if (event.key === 'Escape') { setFinderOpen(false); setMobileOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, []);
  const closeFinder = () => { setFinderOpen(false); setFinder(''); trigger.current?.focus(); };
  const toolLinks = [...items.map(item => ({ title: item.label, href: item.href, key: item.key })), ...studioTools.map(tool => ({ ...tool, key: undefined }))];
  return <div className={s.studio} data-hymn-studio="true" data-mode={producer ? 'producer' : 'artist'}>
    <a className={s.skip} href="#hymn-studio-content">Skip to Studio content</a>
    <div className={s.mobileBar}><button type="button" aria-label="Toggle Studio navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}><Menu size={20}/></button><Link prefetch={false} href="/studio" aria-label="HYMN Studio home"><HymnStudioLogo mobile/></Link><button type="button" aria-label="Find a Studio tool" onClick={() => setFinderOpen(true)}><Search size={19}/></button></div>
    {mobileOpen && <button className={s.scrim} aria-label="Close Studio navigation" onClick={() => setMobileOpen(false)}/>}
    <aside className={s.rail} data-open={mobileOpen} aria-label="Studio navigation">
      <Link prefetch={false} href="/studio" className={s.brand}><HymnStudioLogo/></Link>
      <div className={s.mode}><span>{producer ? 'Producer tools' : 'Artist workspace'}</span>{canProduce ? <Link prefetch={false} href={producer ? '/studio' : '/producer/dashboard'}>{producer ? 'Artist tools' : 'Producer tools'} <ArrowUpRight size={13}/></Link> : <small>Make your next move</small>}</div>
      <button ref={trigger} className={s.finderButton} onClick={() => setFinderOpen(true)}><Search size={16}/>Find a tool<kbd>⌘ K</kbd></button>
      <nav className={s.navigation}>{groups.map(group => <div key={group}><p>{group}</p>{items.filter(item => item.group === group).map(item => {
        const inside = !producer && ['analytics','promotions','content-id','collaborators','subscription','referral','messages','settings','support','account','overview'].includes(item.key);
        const content = <><StudioIcon name={studioDestinations.find(dest => dest.key === item.key)?.icon || (item.key === 'upload' ? 'disc' : 'music')}/><span>{item.label}</span>{item.key === 'messages' && notificationCount > 0 ? <b>{notificationCount}</b> : null}</>;
        return item.href && !inside ? <Link prefetch={false} key={item.key} href={item.href} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => setMobileOpen(false)}>{content}</Link> : <button type="button" key={item.key} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => { onSelect(item.key as T); setMobileOpen(false); }}>{content}</button>;
      })}</div>)}</nav>
      <div className={s.railBottom}><Link prefetch={false} href="/">Back to HYMN <ArrowUpRight size={14}/></Link><span>{user?.name || 'Your creative workspace'}</span></div>
    </aside>
    <div className={s.body}>
      <header className={s.topbar}><div><span>Workspace</span><strong>{current?.label || (setupMode ? 'Set up your storefront' : 'Overview')}</strong></div><div className={s.topActions}><button type="button" aria-label="Studio notifications" onClick={onNotificationsClick}><Bell size={18}/>{notificationCount > 0 && <i/>}</button>{producer && newAction ? <button type="button" className={s.primary} onClick={newAction.onClick}><Plus size={16}/>{newAction.label}</button> : <Link prefetch={false} href="/distribution/start" className={s.primary}><Plus size={16}/>Create release</Link>}<span className={s.avatar} aria-label={user?.name}>{user?.name?.slice(0, 1).toUpperCase() || 'H'}</span></div></header>
      <main id="hymn-studio-content" className={s.content} tabIndex={-1}>
        {activeKey !== 'overview' && !['projects','engineers'].includes(activeKey) && <div className={s.moduleHeader}><div><p className={s.eyebrow}>{producer ? 'Producer tools' : 'HYMN Studio'}</p><h1>{current?.label || 'Your workspace'}</h1></div>{onSearchChange && <label className={s.moduleSearch}><Search size={16}/><input aria-label="Search current Studio section" value={searchValue} onChange={event => onSearchChange(event.target.value)} placeholder="Search this section"/></label>}</div>}
        <div className={s.modules}>{children}</div>
      </main>
    </div>
    {finderOpen && <div className={s.finderOverlay} onClick={closeFinder}><section className={s.finder} role="dialog" aria-modal="true" aria-label="Find a Studio tool" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') { const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button,a[href]')); const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><header><Search size={19}/><input ref={finderInput} aria-label="Search Studio tools" placeholder="What would you like to do?" value={finder} onChange={event => setFinder(event.target.value)}/><button aria-label="Close tool search" onClick={closeFinder}><X size={18}/></button></header><div>{toolLinks.filter(item => item.title.toLowerCase().includes(finder.toLowerCase())).map((item, index) => item.href ? <Link prefetch={false} href={item.href} key={item.title + index} onClick={closeFinder}>{item.title}<ArrowUpRight size={15}/></Link> : <button type="button" key={item.title + index} onClick={() => { onSelect(item.key as T); closeFinder(); }}>{item.title}<ArrowUpRight size={15}/></button>)}{!toolLinks.some(item => item.title.toLowerCase().includes(finder.toLowerCase())) && <p>No tools found. Try “release”, “licence” or “engineer”.</p>}</div><footer>Esc to close · Choose a tool to get started</footer></section></div>}
  </div>;
}
