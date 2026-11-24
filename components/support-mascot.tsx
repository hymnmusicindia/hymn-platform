"use client";

import { useId } from 'react';

/** HYMN's music companion: decorative, scalable artwork with no visible copy. */
export function SupportMascot({className}:{className?:string}) {
  const id=useId().replace(/:/g,'');
  return <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-shell`} x1="22" y1="12" x2="60" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset=".38" stopColor="#edf2f7"/><stop offset=".72" stopColor="#8595a8"/><stop offset="1" stopColor="#c2cfdd"/></linearGradient>
      <linearGradient id={`${id}-band`} x1="12" y1="20" x2="68" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#c2cfdd"/><stop offset=".5" stopColor="#f2f5f8"/><stop offset="1" stopColor="#8595a8"/></linearGradient>
      <linearGradient id={`${id}-face`} x1="27" y1="30" x2="55" y2="57" gradientUnits="userSpaceOnUse"><stop stopColor="#273b50"/><stop offset="1" stopColor="#101926"/></linearGradient>
    </defs>
    <ellipse cx="40" cy="69" rx="19" ry="3" fill="#070e24" opacity=".18"/>
    <path d="M16 41v-5a24 24 0 0 1 48 0v5" stroke="#101c30" strokeWidth="9"/>
    <path d="M16 40v-4a24 24 0 0 1 48 0v4" stroke={`url(#${id}-band)`} strokeWidth="5"/>
    <path d="M19 39c0-15 8-22 21-22s21 7 21 22v8c0 13-9 20-21 20s-21-7-21-20v-8Z" fill={`url(#${id}-shell)`} stroke="#fff" strokeOpacity=".75"/>
    <path d="M26 25c4-4 11-6 18-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".85"/>
    <rect x="23" y="32" width="34" height="24" rx="11" fill={`url(#${id}-face)`} stroke="#728ca5"/>
    <path d="M31 42v4m18-4v4" stroke="#f2f5f8" strokeWidth="4" strokeLinecap="round"/>
    <path d="M37 49q3 3 6 0" stroke="#c2cfdd" strokeWidth="1.7" strokeLinecap="round"/>
    <rect x="11" y="36" width="10" height="21" rx="5" fill={`url(#${id}-band)`} stroke="#fff" strokeOpacity=".65"/>
    <rect x="59" y="36" width="10" height="21" rx="5" fill={`url(#${id}-band)`} stroke="#fff" strokeOpacity=".65"/>
    <path d="M63 55c0 7-6 9-15 9" stroke="#c2cfdd" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="42" y="61" width="9" height="5" rx="2.5" fill="#536982"/>
    <path d="m65 13 1.5 4.5L71 19l-4.5 1.5L65 25l-1.5-4.5L59 19l4.5-1.5L65 13Z" fill="#edf2f7"/>
  </svg>;
}
