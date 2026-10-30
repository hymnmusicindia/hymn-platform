"use client";

import { useId } from "react";

type Option = { key: string; label: string; price: string; disabled: boolean };

// A fixed coordinate system keeps type and hit areas independent of CSS layout.
const point = (radius: number, angle: number) => {
  const radians = angle * Math.PI / 180;
  return [180 + radius * Math.cos(radians), 180 + radius * Math.sin(radians)];
};
function sector(start: number) {
  const end = start + 84;
  const a = point(166, start), b = point(166, end);
  const c = point(66, end), d = point(66, start);
  return `M ${a} A 166 166 0 0 1 ${b} L ${c} A 66 66 0 0 0 ${d} Z`;
}

export function LicenceWheel({ options, highlighted, onHighlight, onSelect, onConfirm, onTouch }: {
  options: Option[]; highlighted: string;
  onHighlight: (key: string | null) => void;
  onSelect: (key: string) => void;
  onConfirm: (key: string) => void;
  onTouch: (key: string) => void;
}) {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 360 360" className="block h-auto w-full select-none" role="group" aria-label="Choose a beat licence">
    <defs>
      <linearGradient id={`${id}-idle`} x2="0.8" y2="1"><stop stopColor="var(--card-strong)"/><stop offset="1" stopColor="var(--bg-soft)"/></linearGradient>
      <linearGradient id={`${id}-active`} x2="0.7" y2="1"><stop stopColor="var(--accent-strong)"/><stop offset="1" stopColor="var(--accent)"/></linearGradient>
      <radialGradient id={`${id}-hub`}><stop stopColor="var(--bg-soft)"/><stop offset="1" stopColor="var(--card)"/></radialGradient>
    </defs>
    <circle cx="180" cy="180" r="177" fill="var(--card)" stroke="var(--border)"/>
    {options.map((option, index) => {
      const start = [183, 273, 93, 3][index];
      const [x, y] = point(116, start + 42);
      const active = highlighted === option.key && !option.disabled;
      return <g key={option.key} role="button" tabIndex={option.disabled ? -1 : 0} aria-disabled={option.disabled} aria-label={`${option.label}, ${option.disabled ? "unavailable" : option.price}. Double click to add to cart.`}
        className="outline-none [&:focus-visible_path]:stroke-[var(--focus)] [&:focus-visible_path]:stroke-[3]"
        style={{ cursor: option.disabled ? "not-allowed" : "pointer", touchAction: "manipulation" }}
        onPointerEnter={() => { if (!option.disabled) onHighlight(option.key); }} onPointerLeave={() => onHighlight(null)}
        onFocus={() => { if (!option.disabled) onHighlight(option.key); }} onBlur={() => onHighlight(null)}
        onPointerUp={event => { if (!option.disabled && event.pointerType === "touch") onTouch(option.key); }}
        onClick={() => { if (!option.disabled) onSelect(option.key); }} onDoubleClick={() => { if (!option.disabled) onConfirm(option.key); }}
        onKeyDown={event => { if (!option.disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onConfirm(option.key); } }}>
        <path d={sector(start)} fill={`url(#${id}-${active ? "active" : "idle"})`} stroke={active ? "var(--accent)" : "var(--border-strong)"} strokeWidth="1" className="transition-[fill,stroke] duration-150"/>
        <text x={x} y={y - 5} textAnchor="middle" fill={active ? "var(--accent-foreground)" : option.disabled ? "var(--text-soft)" : "var(--text)"} fontSize="16" fontWeight="650" pointerEvents="none">{option.label}</text>
        <text x={x} y={y + 18} textAnchor="middle" fill={active ? "var(--accent-foreground)" : "var(--text-muted)"} fontSize="13" pointerEvents="none">{option.disabled ? "Unavailable" : option.price}</text>
      </g>;
    })}
    <circle cx="180" cy="180" r="55" fill={`url(#${id}-hub)`} stroke="var(--border-strong)" pointerEvents="none"/>
    <circle cx="180" cy="169" r="9" fill="none" stroke="var(--money)" pointerEvents="none"/><circle cx="180" cy="169" r="2" fill="var(--money)"/>
    <text x="180" y="192" textAnchor="middle" fill="var(--text)" fontSize="9" letterSpacing="1.4" pointerEvents="none">YOUR SOUND</text>
  </svg>;
}
