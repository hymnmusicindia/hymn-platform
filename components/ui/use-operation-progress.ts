"use client";
import { useEffect, useRef, useState } from "react";
import { advanceOperationProgress, operationTarget } from "@/lib/operation-progress";

/** Smooth async feedback. Raw byte progress reserves the final 20% for verification. */
export function useOperationProgress(active: boolean, measured?: number, complete = false, phase?: string) {
  const [display, setDisplay] = useState({value: 0, indeterminate: false});
  const latest = useRef({measured, complete, phase});
  useEffect(() => { latest.current = {measured, complete, phase}; }, [measured, complete, phase]);
  useEffect(() => {
    if (!active) { setDisplay({value: complete ? 100 : 0, indeterminate: false}); return; }
    if (complete) { setDisplay({value: 100, indeterminate: false}); return; }
    const started = Date.now();
    let value = 1, previous = started, lastActivity = started, lastMeasured = latest.current.measured, lastPhase = latest.current.phase;
    setDisplay({value, indeterminate: false});
    const tick = () => {
      const now = Date.now(), raw = latest.current.measured;
      if (raw !== lastMeasured || latest.current.phase !== lastPhase) { lastActivity = now; lastMeasured = raw; lastPhase = latest.current.phase; }
      const target = latest.current.complete ? 100 : raw == null ? operationTarget(now - started) : raw < 100 ? 1 + Math.max(0, raw) * .79 : Math.max(80, operationTarget(now - started));
      value = latest.current.complete ? 100 : advanceOperationProgress(value, target, now - previous);
      previous = now;
      setDisplay({value: Math.round(value), indeterminate: !latest.current.complete && now - lastActivity >= 45000});
    };
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [active, complete]);
  return display;
}
