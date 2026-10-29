"use client";
import {useState,type ReactNode} from 'react';
import s from './marketplace-operations.module.css';
export function OperationsPanels({panels,initial,activeKey,onChange}:{activeKey?:string;onChange?:(key:string)=>void;panels:Array<{key:string;label:string;count?:number;content:ReactNode}>;initial?:string}){
 const [local,setLocal]=useState(initial||panels[0]?.key);const active=activeKey||local;const setActive=(key:string)=>{setLocal(key);onChange?.(key);};
 return <><nav className={s.tabs} aria-label="Operations sections">{panels.map(panel=><button key={panel.key} type="button" aria-pressed={active===panel.key} onClick={()=>setActive(panel.key)}>{panel.label}{panel.count!==undefined&&<span>{panel.count}</span>}</button>)}</nav><div className={s.panel} key={active}>{panels.find(panel=>panel.key===active)?.content}</div></>;
}
