"use client";
import {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {StudioFrameView} from './hymn-studio-frame';
import {PersistentWorkspaceContext, StudioFrameContext, type StudioFrameConfiguration} from './persistent-workspace-context';
import {LandingWorkspace} from './landing-workspace';
import {studioDestinations, usesHymnStudioShell} from '@/lib/studio-navigation';
import {OacEligibilityPrompt} from './oac-eligibility-prompt';
import s from './hymn-studio.module.css';
export function PersistentSiteWorkspace({children, header, user,desktop=false}: {children:ReactNode; header:ReactNode; user: {sub?:number;name:string;role:string}|null;desktop?:boolean}) {
  const path = usePathname();
  const router = useRouter();
  const [configuration, setConfiguration] = useState<StudioFrameConfiguration | null>(null);
  const activeOwner = useRef<symbol | null>(null);
  const register = useCallback((value:StudioFrameConfiguration) => {
    const token = Symbol(); activeOwner.current = token; setConfiguration(value);
    return () => { if(activeOwner.current === token) activeOwner.current = null; };
  }, []);
  const context = useMemo(() => ({register}), [register]);
  const studio = usesHymnStudioShell(path) || path === '/promotion';
  const standalone = path === '/' || path === '/home' || path === '/team' || path.startsWith('/team/') || path.startsWith('/admin') || path === '/dashboard/admin';
  const active = path.startsWith('/promotion') ? 'promotions' : path.startsWith('/analytics') ? 'analytics' : path.startsWith('/payout') ? 'earnings' : path.includes('library') ? 'library' : 'overview';
  const select = (key:string) => {
    if (activeOwner.current && configuration) configuration.onSelect(key);
    else if(configuration?.workspaceKind==='producer')router.push(`/producer/dashboard?tab=${encodeURIComponent(key)}`);
    else router.push(studioDestinations.find(item => item.key === key)?.href || '/studio');
  };
  if(desktop&&!/^\/(?:admin|team)(?:\/|$)/.test(path))return <div>{header}<main className="shell py-20"><h1 className="text-2xl font-semibold">Choose your staff workspace.</h1><p className="mt-3 text-sm text-[var(--text-muted)]">The Windows app contains Admin OS and Team OS only. Use the workspace switcher above to continue.</p></main></div>;
  return <PersistentWorkspaceContext.Provider value={!standalone}><div className={studio ? s.root : path.startsWith('/admin') ? 'admin-workspace-theme' : 'hymn-public-workspace'}>{header}{user&&!desktop?<OacEligibilityPrompt key={user.sub||user.name}/>:null}
    {standalone ? children : studio ? <StudioFrameContext.Provider value={context}><StudioFrameView {...(configuration || {navItems:[], activeKey:active})} user={user || undefined} activeKey={configuration?.activeKey || active} onSelect={select}>{children}</StudioFrameView></StudioFrameContext.Provider> : <div className="hymn-landing hymn-service-pages"><LandingWorkspace workspaceHref="/studio" releaseNavigation={path === '/distribution/start'}>{children}</LandingWorkspace></div>}
  </div></PersistentWorkspaceContext.Provider>;
}
