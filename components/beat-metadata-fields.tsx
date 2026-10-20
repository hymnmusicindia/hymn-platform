'use client';
import { useId, useState } from 'react';
import { BEAT_GENRES, BEAT_KEYS, BEAT_MOODS, normalizeBeatKey, splitBeatMoods } from '@/lib/beat-metadata';

export function BeatGenreField({ value, onChange }: { value: string; onChange: (value:string)=>void }) {
  return <label>Genre<select className="field" name="genre" required value={value} onChange={event=>onChange(event.target.value)}><option value="">Choose a genre</option>{[...new Set([...BEAT_GENRES, ...(value ? [value] : [])])].map(option=><option key={option}>{option}</option>)}</select></label>;
}
export function BeatKeyField({ value, onChange }: { value:string; onChange:(value:string)=>void }) {
  const normalized = normalizeBeatKey(value);
  return <label>Key / scale<select className="field" name="keySignature" required value={BEAT_KEYS.includes(normalized) ? normalized : ''} onChange={event=>onChange(event.target.value)}><option value="">Choose a key and scale</option>{BEAT_KEYS.map(option=><option key={option}>{option}</option>)}</select></label>;
}
export function BeatMoodField({ value, onChange }: { value:string; onChange:(value:string)=>void }) {
  const id=useId(); const selected=splitBeatMoods(value);
  return <div><input name="mood" type="hidden" value={value}/><label htmlFor={id}>Moods <span>({selected.length}/3)</span></label><select id={id} className="field" aria-describedby={`${id}-hint`} value="" disabled={selected.length>=3} onChange={event=>{if(event.target.value && selected.length<3)onChange([...selected,event.target.value].join(', '));}}><option value="">{selected.length>=3 ? 'Three moods selected' : 'Add a mood'}</option>{BEAT_MOODS.filter(option=>!selected.includes(option)).map(option=><option key={option}>{option}</option>)}</select><div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>{selected.map(mood=><button className="btn-outline" type="button" key={mood} aria-label={`Remove ${mood} mood`} onClick={()=>onChange(selected.filter(option=>option!==mood).join(', '))}>{mood} ×</button>)}</div><p id={`${id}-hint`} style={{fontSize:12,color:'var(--text-soft)',marginTop:6}}>Choose one to three moods.</p></div>;
}
export function BeatEditMetadataFields({genre, mood, keySignature}:{genre:string;mood:string;keySignature:string}) {
  const [nextGenre,setGenre]=useState(genre),[nextMood,setMood]=useState(mood),[nextKey,setKey]=useState(keySignature);
  return <><BeatGenreField value={nextGenre} onChange={setGenre}/><BeatMoodField value={nextMood} onChange={setMood}/><BeatKeyField value={nextKey} onChange={setKey}/></>;
}
