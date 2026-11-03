'use client';
import { useState } from 'react';
export function MusicAppLinks() {
  const [copied, setCopied] = useState(false);
  return <div style={{ display: 'grid', gap: 12 }}><a href="/music/app/download" style={{ background: '#e6d2a3', color: '#17242a', borderRadius: 12, padding: '15px 20px', textAlign: 'center', fontWeight: 700 }}>Download Android app</a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/music/app`); setCopied(true); } catch { window.prompt('Copy this app link', `${window.location.origin}/music/app`); } }} style={{ border: '1px solid #667386', color: '#f2f5f8', padding: 13, borderRadius: 12 }}>{copied ? 'Link copied' : 'Copy app link'}</button><span role="status" style={{ fontSize: 12, color: '#bbc5d1' }}>{copied ? 'Send this link to your Android phone.' : 'Android 8.0 or later'}</span></div>;
}
