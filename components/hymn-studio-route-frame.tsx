"use client";
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { HymnStudioFrame } from './hymn-studio-frame';
import { studioDestinations } from '@/lib/studio-navigation';

/** Existing private tools keep their routes and authorization inside the unified Studio shell. */
export function HymnStudioRouteFrame({ children, user }: { children: ReactNode; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname === '/studio/engineer' || pathname.startsWith('/studio/engineer/') ? 'engineer-workspace' : pathname.startsWith('/library') || pathname.startsWith('/dashboard/purchases') || pathname === '/audio-library' ? 'library' : pathname.startsWith('/dashboard/releases') ? 'releases' : pathname.startsWith('/analytics') ? 'analytics' : pathname.startsWith('/payout') ? 'earnings' : pathname.startsWith('/studio/engineers') || pathname.startsWith('/studio/genres') ? 'engineers' : 'projects';
  return <HymnStudioFrame user={user} workspaceKind="customer" activeKey={active} navItems={[]} onSelect={key => router.push(studioDestinations.find(item => item.key === key)?.href || '/studio')} onNotificationsClick={() => router.push('/studio?tab=messages')}>{children}</HymnStudioFrame>;
}
