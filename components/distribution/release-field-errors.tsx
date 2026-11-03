"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import styles from './release-field-errors.module.css';

type Issue={key:string;message:string};
type Slot={key:string;target:HTMLElement;host:HTMLElement;controls:HTMLElement[];previousInvalid:(string|null)[]};
const controlsSelector='input:not([type="hidden"]),select,textarea,button:not([disabled]),[role="combobox"]';

/** Put validation beside the actual registered control, including composite pickers. */
export function ReleaseFieldErrors({issues,shown,fields}:{issues:Issue[];shown:ReadonlySet<string>;fields:RefObject<Record<string,HTMLElement|null>>}) {
  const slots=useRef(new Map<string,Slot>());
  const [rendered,setRendered]=useState<Slot[]>([]);
  function remove(slot:Slot) {
    const id=slot.host.id;
    slot.controls.forEach((control,index)=>{
      const other=(control.getAttribute('aria-describedby')||'').split(/\s+/).filter(value=>value&&value!==id);
      if(other.length)control.setAttribute('aria-describedby',other.join(' '));else control.removeAttribute('aria-describedby');
      if(control.getAttribute('aria-invalid')==='true') {
        const previous=slot.previousInvalid[index];if(previous===null)control.removeAttribute('aria-invalid');else control.setAttribute('aria-invalid',previous);
      }
    });
    slot.target.classList.remove(styles.invalid);slot.target.removeAttribute('data-release-invalid');slot.host.remove();
  }
  useEffect(()=>{
    const wanted=new Map<HTMLElement,Issue>();
    for(const issue of issues)if(shown.has(issue.key)) {
      const key=issue.key==='audio-upload'?'track-0-audio':issue.key==='release-primary-artists'?'track-0-artists':issue.key;
      const target=fields.current[issue.key]??fields.current[key];if(target?.isConnected)wanted.set(target,issue);
    }
    let changed=false;
    for(const [key,slot]of slots.current)if(![...wanted].some(([target,issue])=>target===slot.target&&issue.key===key)) {remove(slot);slots.current.delete(key);changed=true;}
    for(const [target,issue]of wanted) {
      let slot=slots.current.get(issue.key);
      if(!slot) {
        const host=document.createElement('div');host.id=`release-field-error-${issue.key.replace(/[^a-z0-9_-]/gi,'-')}`;
        if(target.matches('input,select,textarea,button'))target.insertAdjacentElement('afterend',host);else target.append(host);
        const controls=target.matches(controlsSelector)?[target]:Array.from(target.querySelectorAll<HTMLElement>(controlsSelector));
        slot={key:issue.key,target,host,controls,previousInvalid:controls.map(control=>control.getAttribute('aria-invalid'))};
        slots.current.set(issue.key,slot);changed=true;
      }
      target.classList.add(styles.invalid);target.setAttribute('data-release-invalid','true');
      for(const control of slot.controls){control.setAttribute('aria-invalid','true');const ids=new Set((control.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(slot.host.id);control.setAttribute('aria-describedby',[...ids].join(' '));}
    }
    if(changed)setRendered([...slots.current.values()]);
  });
  useEffect(()=>()=>{for(const slot of slots.current.values())remove(slot);slots.current.clear();},[]);
  return <>{rendered.map(slot=>{const issue=issues.find(item=>item.key===slot.key);return issue&&shown.has(slot.key)?createPortal(<p className={styles.message} role="alert"><AlertCircle size={14} aria-hidden="true"/><span>{issue.message}</span></p>,slot.host,slot.key):null;})}</>;
}
