"use client";
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { usesHymnStudioShell } from '@/lib/studio-navigation';
import s from './hymn-studio.module.css';

/** Studio inherits the actual site theme, without the legacy portal's forced-dark palette. */
export function HymnPortalRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={usesHymnStudioShell(pathname) ? s.root : 'hymn-portal-root'}>{children}</div>;
}
