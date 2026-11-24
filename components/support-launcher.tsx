"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { SupportMascot } from './support-mascot';
import styles from './support-launcher.module.css';

type Mode = 'hidden' | 'greeting' | 'visible' | 'peek';
const GREETED = 'hymn-support-greeted-v1';
const DISMISSED = 'hymn-support-dismissed-v1';
const PEEKS = 'hymn-support-peeks-v1';
function read(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch { /* Browsing remains usable without storage. */ } }

/** Only the invitation animates; it never opens a conversation or sends a request. */
export function SupportLauncher({ open, onOpen, launcherRef }: { open: boolean; onOpen: () => void; launcherRef: RefObject<HTMLButtonElement | null> }) {
  const [mode, setMode] = useState<Mode>('hidden');
  const [engaged, setEngaged] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const revealRef = useRef<HTMLButtonElement>(null);
  const greeted = useRef(false);
  const peeks = useRef(0);
  const focusAfterTransition = useRef<'launcher' | 'reveal' | null>(null);

  useEffect(() => {
    if (open) return;
    if (mode === 'visible' && focusAfterTransition.current === 'launcher') {
      focusAfterTransition.current = null;
      launcherRef.current?.focus();
    } else if (mode === 'hidden' && focusAfterTransition.current === 'reveal') {
      focusAfterTransition.current = null;
      revealRef.current?.focus();
    }
  }, [mode, open, launcherRef]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReducedMotion(media.matches);
    const visibility = () => setVisible(document.visibilityState === 'visible');
    motion(); visibility();
    greeted.current = read(GREETED) === '1';
    peeks.current = Number(read(PEEKS) || 0);
    setDismissed(read(DISMISSED) === '1');
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    if (open) {
      greeted.current = true; write(GREETED, '1');
      setMode('visible');
      return;
    }
    if (!visible || engaged) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (mode === 'greeting') timer = setTimeout(() => setMode('hidden'), 7000);
    else if (mode === 'peek') timer = setTimeout(() => setMode('hidden'), 4000);
    else if (mode === 'visible') timer = setTimeout(() => setMode('hidden'), 18000);
    else if (!dismissed && !greeted.current) timer = setTimeout(() => {
      greeted.current = true; write(GREETED, '1'); setMode('greeting');
    }, 4500);
    else if (!dismissed && !reducedMotion && peeks.current < 2) timer = setTimeout(() => {
      peeks.current += 1; write(PEEKS, String(peeks.current)); setMode('peek');
    }, 70000);
    return () => { if (timer) clearTimeout(timer); };
  }, [mode, open, engaged, visible, dismissed, reducedMotion]);

  function hide() {
    setDismissed(true); write(DISMISSED, '1');
    greeted.current = true; write(GREETED, '1');
    focusAfterTransition.current = 'reveal';
    setMode('hidden'); setEngaged(false);
  }
  function reveal() {
    greeted.current = true; write(GREETED, '1');
    focusAfterTransition.current = 'launcher';
    setMode('visible');
  }
  if (open) return null;
  return <div className={styles.dock} data-support-mode={mode} onMouseEnter={() => setEngaged(true)} onMouseLeave={() => setEngaged(false)} onFocusCapture={() => setEngaged(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEngaged(false); }}>
    <div className={styles.invitation} aria-hidden={mode === 'hidden'} inert={mode === 'hidden' || undefined}>
      <div className={styles.greeting} aria-hidden={mode !== 'greeting'} inert={mode !== 'greeting' || undefined}>
        <button type="button" className={styles.greetingMessage} onClick={onOpen}><strong>Hi, how can I help you?</strong><span>Releases, beats or your next step.</span></button><button type="button" className={styles.dismissGreeting} aria-label="Dismiss support greeting" onClick={hide}><X size={13}/></button>
      </div>
      <div className={styles.mascotRow}><button type="button" ref={launcherRef} className={styles.launcher} aria-label="Open HYMN support" aria-expanded={false} aria-controls="hymn-support-chat" onClick={onOpen}><SupportMascot/></button><button type="button" className={styles.hide} aria-label="Hide HYMN support" onClick={hide}><X size={12}/></button></div>
    </div>
    <button type="button" ref={revealRef} className={styles.reveal} aria-label="Reveal HYMN support" title="HYMN support is here when you need it" onClick={reveal} tabIndex={mode === 'hidden' || mode === 'peek' ? 0 : -1}><ChevronLeft size={16}/><span className={styles.srOnly}>HYMN support</span></button>
  </div>;
}
