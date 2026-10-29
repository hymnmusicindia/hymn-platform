import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname, useSearchParams } from 'next/navigation';
import { LandingWorkspace } from '../../components/landing-workspace';
import { DashboardFrame } from '../../components/dashboard-frame';
import { AdminNavigationGroups } from '../../components/admin-navigation-groups';
import { TeamSectionNavigation } from '../../components/team/section-navigation';
import { ModuleTabs } from '../../components/module-tabs';
import { LayoutGrid } from 'lucide-react';
import { workspaceNavigation } from '../../lib/workspace-navigation';
import '../../app/styles/landing.css';
import '../../app/styles/portal.css';
import '../../app/styles/workspace-enterprise.css';
import '../../app/styles/sidebar-consistency.css';
import '../../app/styles/workspace-navigation.css';

function Fixture() {
  const pathname = usePathname(), params = useSearchParams();
  const [mode] = useState(params.get('mode') || 'landing');
  const active = params.get('tab') || workspaceNavigation.find(item => item.key !== 'overview' && !item.href.includes('?') && item.href === pathname)?.key || 'overview';
  const select = (key: string) => history.pushState(null, '', `${pathname}?tab=${key}`);
  if (mode === 'landing') return <div className="hymn-landing"><LandingWorkspace workspaceHref="/dashboard"><h1>Page: {pathname}</h1></LandingWorkspace></div>;
  if (mode === 'admin') {
    const items = [
      { key: 'overview', label: 'Overview', group: 'Overview' },
      { key: 'releases', label: 'Releases', group: 'Distribution' }, { key: 'delivery', label: 'Delivery', group: 'Distribution' },
      { key: 'revenue', label: 'Revenue', group: 'Finance' }, { key: 'payouts', label: 'Payouts', group: 'Finance' },
    ].map(item => ({ ...item, description: item.label, href: `/admin?tab=${item.key}` }));
    const current = items.find(item => item.key === active)!;
    return <><nav aria-label="Admin sections"><AdminNavigationGroups items={items} active={active} search=""/></nav><ModuleTabs items={items.filter(item => item.group === current.group)} active={active} label={current.group}/></>;
  }
  if (mode === 'team') {
    const sections = [{ label: 'Home', items: [{ id: 'overview', title: 'Home', icon: LayoutGrid }] }, { label: 'Work & schedule', items: [{ id: 'work', title: 'My work', icon: LayoutGrid }, { id: 'calendar', title: 'Calendar', icon: LayoutGrid }] }, { label: 'Contacts & growth', items: [{ id: 'contacts', title: 'Contacts', icon: LayoutGrid }, { id: 'customer-calls', title: 'Callbacks', icon: LayoutGrid }] }];
    const current = sections.find(section => section.items.some(item => item.id === active))!;
    return <><nav aria-label="Team sections"><TeamSectionNavigation sections={sections} active={active} unread={0} onSelect={select}/></nav><ModuleTabs items={current.items.map(item => ({ key: item.id, label: item.title }))} active={active} label={current.label} onSelect={select}/></>;
  }
  return <DashboardFrame workspaceKind={mode === 'producer' ? 'producer' : 'customer'} title="Dashboard" subtitle="Fixture" activeKey={active} onSelect={select} navItems={[
    { key: 'overview', label: 'Overview', group: 'Home' },
    { key: 'catalog', label: 'My beats', group: 'Beatstore' }, { key: 'upload', label: 'Upload beat', group: 'Beatstore' },
    { key: 'earnings', label: 'Earnings', group: mode === 'producer' ? 'Business' : 'Distribution' }, { key: 'payouts', label: 'Payouts', group: 'Business' },
    { key: 'profile', label: 'Profile', group: 'Account' }, { key: 'support', label: 'Support', group: 'Support' },
  ]}><h1>Selected: {active}</h1></DashboardFrame>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
