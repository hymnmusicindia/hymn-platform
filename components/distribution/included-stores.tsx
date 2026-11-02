"use client";

import { useEffect, useRef } from 'react';
import { storePlatforms } from '@/lib/release-config';
import { StoreChoice } from './store-choice';
import styles from './store-choice.module.css';

const topNames = ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music', 'JioSaavn'];
const remaining = storePlatforms.filter(store => !topNames.includes(store.name));

export function IncludedStores({selected, onChange}: {selected:string[]; onChange:(stores:string[])=>void}) {
  const groupInput = useRef<HTMLInputElement>(null);
  const selectedCount = remaining.filter(store=>selected.includes(store.name)).length;
  const allSelected = selectedCount === remaining.length;
  useEffect(()=>{ if(groupInput.current) groupInput.current.indeterminate = selectedCount > 0 && !allSelected; },[selectedCount,allSelected]);
  const toggle = (name:string) => onChange(selected.includes(name) ? selected.filter(store=>store!==name) : [...selected,name]);
  function toggleRemaining() {
    // Remove the legacy aggregate too, so an unchecked group stays unchecked after restoring a draft.
    const base = selected.filter(name=>name!=='150+ More Stores' && !remaining.some(store=>store.name===name));
    onChange(allSelected ? base : [...base,...remaining.map(store=>store.name)]);
  }
  return <div>
    <div className={styles.grid}>{topNames.map(name => <StoreChoice key={name} name={name} checked={selected.includes(name)} onChange={()=>toggle(name)} />)}</div>
    <div className={styles.remainingGroup}>
      <details className={styles.remaining}>
      <summary><span>{remaining.length} remaining stores</span></summary>
      <div className={styles.grid}>{remaining.map(store => <StoreChoice key={store.name} name={store.name} included />)}</div>
      </details>
      <label className={styles.groupCheckbox}><input ref={groupInput} type="checkbox" checked={allSelected} onChange={toggleRemaining} aria-label="Select all remaining stores" /></label>
    </div>
    <p className={styles.note}>Selections save your delivery preferences. Store exclusions are not currently supported by the distribution connection. Availability depends on store acceptance.</p>
  </div>;
}
