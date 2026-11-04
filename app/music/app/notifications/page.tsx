import Link from 'next/link';

export const metadata = { title: 'Phone notifications | HYMN Music' };
export default function PhoneNotificationSettings() {
  return <main style={{ minHeight: '80dvh', display: 'grid', placeItems: 'center', padding: '32px 20px', color: 'var(--text)' }}>
    <section style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: 28 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Your music. Your updates.</h1>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>Use the latest HYMN Music Android app for release updates, beat purchases and Studio messages. Open the notification bell, then Phone alert settings to enable or pause alerts.</p>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, margin: '16px 0 24px' }}>You can also choose individual categories in Android Settings → Apps → HYMN Music → Notifications. Background delivery may be delayed by battery settings; your HYMN inbox stays available.</p>
      <Link href="/music/app" className="btn-primary" style={{ display: 'inline-flex', padding: '12px 18px', borderRadius: 12 }}>Get HYMN for Android</Link>
    </section>
  </main>;
}
