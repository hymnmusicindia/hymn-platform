"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import styles from './youtube-oac-page.module.css';

type Artist={id:number;artistName:string;imageUrl?:string|null};
function ArtistPhoto({artist}:{artist?:Artist}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[artist?.imageUrl]);
  return <span className={styles.selectAvatar}>{artist?.imageUrl&&!failed?<img src={artist.imageUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<UserRound size={17} aria-hidden="true"/>}</span>;
}

export function OacArtistSelect({artists,value,disabled,loading,onChange,label="Choose artist"}:{label?:string;artists:Artist[];value:number;disabled?:boolean;loading?:boolean;onChange:(id:number)=>void}){
  const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(0);
  const typed=useRef({text:'',at:0});
  const selected=artists.find(artist=>artist.id===value);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
  useEffect(()=>{if(open)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[open,active,id]);
  function choose(index:number){if(!artists[index])return;setOpen(false);onChange(artists[index].id);trigger.current?.focus();}
  function keyboard(event:KeyboardEvent<HTMLButtonElement>){
    if(event.key==='Tab'){setOpen(false);return;}
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!open){setActive(Math.max(0,artists.findIndex(artist=>artist.id===value)));setOpen(true);return;}
      setActive(index=>event.key==='Home'?0:event.key==='End'?artists.length-1:Math.max(0,Math.min(artists.length-1,index+(event.key==='ArrowDown'?1:-1))));return;
    }
    if((event.key==='Enter'||event.key===' ')&&open){event.preventDefault();choose(active);return;}
    if(event.key.length===1&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.key!==' '){const now=Date.now();typed.current={text:(now-typed.current.at<700?typed.current.text:'')+event.key.toLocaleLowerCase(),at:now};const match=artists.findIndex(artist=>artist.artistName.toLocaleLowerCase().startsWith(typed.current.text));if(match>=0){event.preventDefault();setActive(match);setOpen(true);}}
  }
  return <div ref={root} className={styles.customSelect} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <span id={`${id}-label`} className={styles.selectLabel}>{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?`${id}-list`:undefined} aria-activedescendant={open?`${id}-${active}`:undefined} disabled={disabled||!artists.length} className={styles.selectTrigger} onKeyDown={keyboard} onClick={()=>{setActive(Math.max(0,artists.findIndex(artist=>artist.id===value)));setOpen(!open);}}>
      <ArtistPhoto artist={selected}/><span>{loading?'Loading artists...':selected?.artistName||'Choose artist...'}</span><ChevronDown size={17} aria-hidden="true" className={open?styles.selectChevronOpen:undefined}/>
    </button>
    {open?<ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={styles.selectMenu}>{artists.map((artist,index)=><li key={artist.id} id={`${id}-${index}`} role="option" aria-selected={artist.id===value} data-active={index===active||undefined} onPointerMove={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(index)}><ArtistPhoto artist={artist}/><span>{artist.artistName}</span>{artist.id===value?<Check size={16} aria-hidden="true"/>:null}</li>)}</ul>:null}
  </div>;
}
