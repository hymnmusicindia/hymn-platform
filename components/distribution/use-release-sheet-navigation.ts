"use client";

import { useCallback, useEffect, useRef } from 'react';

/** Observe the existing form sections without unmounting fields or changing release data. */
export function useReleaseSheetNavigation({enabled, initialStage, onActive, paused=false}: {
  enabled:boolean; initialStage:number; onActive:(stage:number)=>void; paused?:boolean;
}) {
  const formRef=useRef<HTMLFormElement>(null);
  const onActiveRef=useRef(onActive); onActiveRef.current=onActive;
  const initialRef=useRef(initialStage); initialRef.current=initialStage;
  const pausedRef=useRef(paused); pausedRef.current=paused;
  const scrollToStage=useCallback((stage:number, instant=false)=>{
    const section=formRef.current?.querySelector<HTMLElement>(`[data-release-section="${stage}"]`);
    if(!section) return;
    section.scrollIntoView({block:'start',behavior:instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[]);
  useEffect(()=>{
    if(!enabled || !formRef.current) return;
    const form=formRef.current;
    const sections=Array.from(form.querySelectorAll<HTMLElement>('[data-release-section]'));
    let frame=0,disposed=false,last=-1;
    const measure=()=>{
      frame=0;if(disposed || pausedRef.current) return;
      const header=document.querySelector('.release-navigation-header')?.getBoundingClientRect();
      let top=Math.max(window.innerHeight*.25,Math.min(window.innerHeight*.4,header?.bottom ?? 112)+24);
      for(let parent=form.parentElement;parent;parent=parent.parentElement) {
        const style=getComputedStyle(parent);
        if(/auto|scroll/.test(style.overflowY) && parent.scrollHeight>parent.clientHeight) { top=Math.max(top,parent.getBoundingClientRect().top+24); break; }
      }
      let active=sections[0];
      for(const section of sections) {if(section.getBoundingClientRect().top<=top)active=section;else break;}
      const stage=Number(active?.dataset.releaseSection);
      if(Number.isFinite(stage)&&stage!==last){last=stage;onActiveRef.current(stage);}
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const first=requestAnimationFrame(()=>{scrollToStage(initialRef.current,true);schedule();});
    document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
    sections.forEach(section=>observer?.observe(section));
    return()=>{disposed=true;cancelAnimationFrame(first);if(frame)cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  },[enabled,scrollToStage]);
  return {formRef,scrollToStage};
}
