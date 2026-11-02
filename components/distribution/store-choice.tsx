"use client";

import { useState } from "react";
import { Music2 } from "lucide-react";
import sources from "@/public/assets/store-logos/original/sources.json";
import styles from "./store-choice.module.css";

const keys: Record<string,string> = {
  Spotify:'spotify', 'Apple Music':'apple', iTunes:'apple', 'Amazon Music':'amazon', 'YouTube Music':'youtube',
  'YouTube Content ID':'youtube', JioSaavn:'jiosaavn', Gaana:'gaana', 'Wynk Music':'wynk', Hungama:'hungama',
  Deezer:'deezer', Tidal:'tidal', Pandora:'pandora', SoundCloud:'soundcloud', Audiomack:'audiomack', Anghami:'anghami',
  Boomplay:'boomplay', Napster:'napster', iHeartRadio:'iheart', 'Instagram / Facebook':'facebook', TikTok:'tiktok',
  Snapchat:'snapchat', Shazam:'shazam', Qobuz:'qobuz', Beatport:'beatport', Traxsource:'traxsource', '7digital':'sevendigital',
  'Tencent Music (QQ Music, Kugou, Kuwo)':'tencent', 'NetEase Cloud Music':'netease', 'Yandex Music':'yandex',
  'VK Music':'vk', KKBOX:'kkbox', JOOX:'joox', 'LINE MUSIC':'line', Melon:'melon', 'Genie Music':'genie', FLO:'flo', Bugs:'bugs',
};

export function StoreChoice({name, checked, disabled = false, onChange}: {
  name:string; checked:boolean; disabled?:boolean; onChange:()=>void;
}) {
  const [failed,setFailed]=useState(false);
  const asset=sources.assets.find(item=>item.key===keys[name]);
  const file=asset && 'file' in asset ? asset.file : undefined;
  const label=name==='150+ More Stores'?'Other supported stores':name;
  return <label className={styles.row} data-disabled={disabled || undefined}>
    <span className={styles.logo} data-brand={keys[name]} aria-hidden="true">
      {file && !failed ? <img src={`/assets/store-logos/original/${file}`} alt="" width={24} height={24} loading="lazy" onError={()=>setFailed(true)} /> : <Music2 size={19}/>}
    </span>
    <span className={styles.name}>{label}</span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label}/>
  </label>;
}
