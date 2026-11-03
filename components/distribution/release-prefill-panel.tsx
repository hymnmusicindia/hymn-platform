"use client";

import { useEffect,useState } from 'react';
import { ChevronDown,History } from 'lucide-react';
import type { ReleasePrefillSuggestion } from '@/lib/release-prefill';
import { matchingSafePrefills,releasePrefillLabels,sensitivePrefillFields,usablePrefill,type PrefillValues } from '@/lib/release-prefill-review';
import styles from './release-prefill-panel.module.css';

const sourceLabels={USER_DEFAULT:'Saved preference',PREVIOUS_RELEASE:'Previous release',ARTIST_PROFILE:'Artist profile',SYSTEM_DEFAULT:'Default'};
export function ReleasePrefillPanel({suggestions,pending,current,customLabelAllowed,onResolve,onConfirmMatching,hasError}:{
  suggestions:ReleasePrefillSuggestion[];pending:ReadonlySet<string>;current:PrefillValues;customLabelAllowed:boolean;
  onResolve:(field:ReleasePrefillSuggestion['field'],use:boolean)=>void;onConfirmMatching:()=>void;hasError:boolean;
}) {
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(hasError)setOpen(true);},[hasError]);
  const items=suggestions.filter(item=>pending.has(item.field));
  const matching=matchingSafePrefills(suggestions,pending,current,customLabelAllowed);
  return <details className={styles.panel} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><History size={17} aria-hidden="true"/><span><strong>Suggested details</strong><small>From your preferences and previous releases</small></span><span className={styles.count}>{items.length} to review</span><ChevronDown size={16} aria-hidden="true"/></summary>
    <div className={styles.body}>
      <p>Confirm these values for this release, or keep your own edits. Rights owners are always confirmed individually.</p>
      {items.map(item=>{const same=current[item.field]===item.value,allowed=usablePrefill(item,current,customLabelAllowed);return <div className={styles.item} key={item.field}>
        <div className={styles.value}><div><strong>{releasePrefillLabels[item.field]}</strong><span>{sourceLabels[item.source]}</span></div><p>{item.value}</p>{!same&&current[item.field]?<small>Current: {current[item.field]}</small>:null}{sensitivePrefillFields.has(item.field)?<small>Confirm ownership for this release</small>:null}{!allowed?<small>Choose a compatible genre or enter this value in its field.</small>:null}</div>
        <div className={styles.actions}><button type="button" disabled={!allowed} onClick={()=>onResolve(item.field,true)} aria-label={`${same?'Confirm':'Use suggestion for'} ${releasePrefillLabels[item.field]}`}>{same?'Confirm':'Use suggestion'}</button><button type="button" onClick={()=>onResolve(item.field,false)}>{same?'Enter myself':current[item.field]?'Keep current':'Enter myself'}</button></div>
      </div>;})}
      {matching.length?<button type="button" className={styles.confirmMatching} onClick={onConfirmMatching}>Confirm {matching.length} matching detail{matching.length===1?'':'s'}</button>:null}
    </div>
  </details>;
}
