"use client";
import { useState } from "react";
import styles from "./calendar.module.css";

export function TeamTimeField({ name, label, date, value, required = false }: { name: string; label: string; date: string; value?: string | null; required?: boolean }) {
  const initial = value ? new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 16) : "";
  const hour24 = initial ? Number(initial.slice(11, 13)) : null;
  const [day, setDay] = useState(initial.slice(0, 10) || date);
  const [hour, setHour] = useState(hour24 === null ? "" : String(hour24 % 12 || 12));
  const [minute, setMinute] = useState(initial.slice(14, 16));
  const [period, setPeriod] = useState(initial ? hour24! >= 12 ? "PM" : "AM" : "");
  const [dial, setDial] = useState(false), [unit, setUnit] = useState<"hour" | "minute">("hour");
  const complete = day && hour && minute && period;
  const mandatory = required || Boolean(hour || minute || period);
  const time = complete ? `${day}T${String(Number(hour) % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}` : "";
  const numbers = unit === "hour" ? Array.from({ length: 12 }, (_, i) => String(i + 1)) : Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  return <fieldset className={styles.timeField}><legend>{label} {required ? "*" : "(optional)"}</legend>
    <input type="hidden" name={name} value={time}/>
    <label>Date<input aria-label={`${label} date`} type="date" value={day} onChange={e => setDay(e.target.value)} required={mandatory}/></label>
    <div className={styles.timeInputs}>
      <label>Hour<select aria-label={`${label} hour`} value={hour} required={mandatory} onChange={e => setHour(e.target.value)}><option value="">HH</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}</select></label>
      <label>Minute<select aria-label={`${label} minute`} value={minute} required={mandatory} onChange={e => setMinute(e.target.value)}><option value="">MM</option>{Array.from({ length: 60 }, (_, i) => <option key={i}>{String(i).padStart(2, "0")}</option>)}</select></label>
      <label>AM / PM<select aria-label={`${label} AM or PM`} value={period} required={mandatory} onChange={e => setPeriod(e.target.value)}><option value="">Select</option><option>AM</option><option>PM</option></select></label>
    </div>
    <div className={styles.timeTools}><button type="button" aria-expanded={dial} onClick={() => setDial(!dial)}>◷ {dial ? "Close dial" : "Choose on clock"}</button>{!required && <button type="button" onClick={() => { setHour(""); setMinute(""); setPeriod(""); }}>Clear end time</button>}</div>
    {dial && <div className={styles.dialPanel}><div className={styles.timeTools}><button type="button" aria-pressed={unit === "hour"} onClick={() => setUnit("hour")}>Hours</button><button type="button" aria-pressed={unit === "minute"} onClick={() => setUnit("minute")}>Minutes</button></div><div className={styles.clock} aria-label={`Choose ${unit}`}>
      {numbers.map((number, i) => { const angle = (unit === "hour" ? i + 1 : i) * Math.PI / 6; return <button type="button" key={number} aria-label={`${label} ${unit} ${number}`} aria-pressed={unit === "hour" ? hour === number : minute === number} style={{ left: `${50 + Math.sin(angle) * 39}%`, top: `${50 - Math.cos(angle) * 39}%` }} onClick={() => { if (unit === "hour") { setHour(number); setUnit("minute"); } else setMinute(number); }}>{number}</button>; })}<span className={styles.clockCenter}/>
    </div><p>Choose AM or PM above. You can also enter any minute with the controls.</p></div>}
    <small>India time (IST){!required && " · Leave blank for a start-only appointment"}</small>
  </fieldset>;
}
