'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { musicAppNeedsUpdate } from '@/lib/music-app-version';
import { useAccessibleDialog } from './ui/use-accessible-dialog';

export function MusicAppUpdate() {
  const [version, setVersion] = useState<string | null>(null);
  const dialog = useAccessibleDialog(Boolean(version), () => dismiss());
  function dismiss() {
    if (version) try { localStorage.setItem(`hymn-app-update:${version}`, String(Date.now())); } catch {}
    setVersion(null);
  }
  useEffect(() => {
    if (!/\bHYMNMusic\//.test(navigator.userAgent)) return;
    let disposed = false, lastChecked = 0;
    let controller: AbortController | null = null;
    async function check() {
      if (document.visibilityState !== 'visible' || Date.now() - lastChecked < 60000) return;
      lastChecked = Date.now(); controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch('/api/music/app-release', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const release = await response.json();
        if (!musicAppNeedsUpdate(navigator.userAgent, release.version)) return;
        let dismissed = 0;
        try { dismissed = Number(localStorage.getItem(`hymn-app-update:${release.version}`)); } catch {}
        if (!disposed && !(dismissed > 0 && Date.now() - dismissed < 86400000)) setVersion(release.version);
      } catch { /* Updating must never block the artist's current work. */ }
      finally { clearTimeout(timeout); }
    }
    void check(); const interval = setInterval(() => void check(), 900000);
    const visible = () => { void check(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible);
    return () => { disposed = true; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); };
  }, []);
  if (!version) return null;
  return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 2300, background: '#071018aa', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20 }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="hymn-app-update-title" tabIndex={-1} style={{ width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', borderRadius: 24, border: '1px solid var(--border)', padding: 28, background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 24px 80px #0005' }}>
      <p style={{ fontSize: 11, letterSpacing: 2, color: 'var(--text-muted)' }}>HYMN MUSIC / {version}</p>
      <h2 id="hymn-app-update-title" style={{ fontSize: 28, lineHeight: 1.15, margin: '12px 0' }}>A new update is ready.</h2>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }}>Stay closer to your music with phone alerts for releases, beats and Studio messages.</p>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)', margin: '12px 0 22px' }}>Download the update, open the saved APK and tap Install. Keep the existing app installed to preserve your sign-in. Android will ask you to confirm installation.</p>
      <a href="/music/app/download" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', padding: 14, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-foreground)', fontWeight: 700 }} onClick={dismiss}>Download update</a>
      <button type="button" onClick={dismiss} style={{ width: '100%', padding: 14, marginTop: 8, color: 'var(--text)' }}>Later</button>
    </section>
  </div>, document.body);
}
