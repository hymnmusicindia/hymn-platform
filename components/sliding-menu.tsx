"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import s from './sliding-menu.module.css';
/** Only a change of menu contents animates; selecting a destination keeps the rail still. */
export function SlidingMenu({menuKey, children}: {menuKey: string; children: ReactNode}) {
  const previous = useRef({key: menuKey, children});
  const [outgoing, setOutgoing] = useState<ReactNode>(null);
  const timer=useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    if (previous.current.key !== menuKey) {
      setOutgoing(previous.current.children);
      previous.current = {key: menuKey, children};
      if(timer.current)clearTimeout(timer.current);
      timer.current = setTimeout(() => setOutgoing(null), 240);
    }
    previous.current.children = children;
  }, [menuKey, children]);
  useLayoutEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <div className={s.viewport} data-menu-transition={outgoing ? 'active' : undefined}>
    {outgoing && <div className={s.outgoing} inert aria-hidden="true">{outgoing}</div>}
    <div key={menuKey} className={outgoing ? s.incoming : undefined}>{children}</div>
  </div>;
}
