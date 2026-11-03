"use client";
import { useEffect, useState } from 'react';
import { labelArtistQuote, LABEL_MAX_EXTRA_ARTISTS } from '@/lib/label-artist-pricing';
import { Minus, Plus, Users } from 'lucide-react';
import { QuantitySlider } from '@/components/ui/quantity-slider';
export function LabelArtistSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const quote = labelArtistQuote(value);
  const [sliderMax, setSliderMax] = useState(Math.max(30, Math.ceil(value / 30) * 30));
  useEffect(() => setSliderMax(n => Math.max(n, Math.ceil(value / 30) * 30)), [value]);
  return <div className="label-artist-selector">
    <div className="label-artist-selector-title"><Users size={15}/><label htmlFor="label-extra-artists">Make room for more artists</label></div>
    <div className="label-artist-stepper"><strong>15 <span>+ {value}</span></strong><div>
      <button type="button" aria-label="Remove one extra artist" disabled={!value} onClick={() => onChange(value - 1)}><Minus size={14}/></button>
      <input id="label-extra-artists" type="number" min={0} max={LABEL_MAX_EXTRA_ARTISTS} step={1} value={value} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= LABEL_MAX_EXTRA_ARTISTS) onChange(n); }}/>
      <button type="button" aria-label="Add one extra artist" disabled={value >= LABEL_MAX_EXTRA_ARTISTS} onClick={() => onChange(value + 1)}><Plus size={14}/></button>
    </div></div>
    <QuantitySlider label="Extra artist slots" value={value} max={Math.min(LABEL_MAX_EXTRA_ARTISTS, sliderMax)} onChange={onChange} format={n => `+${n}`}/>
    <p aria-live="polite">{quote.artists} artists · ₹{(quote.addon / 100).toLocaleString('en-IN')} extra / year</p>
    <small>15 included. Each extra artist ₹250 / year.<br/>{quote.discount ? `5% off extras · save ₹${quote.discount / 100} each year.` : 'Choose 8+ extras for 5% off the extra-slot cost.'}</small>
  </div>;
}
