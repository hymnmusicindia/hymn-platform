"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Compass, Phone, Search, ShieldCheck } from "lucide-react";
import styles from "./daily-guide.module.css";

type Plan = { day: string; owner: boolean; workRole: string; researchTarget: number; callTarget: number; researched: number; called: number; ready: number; overdue: number; teamIntake?: number; tasks: { id: string; title: string; status: string }[] };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
const answers = {
  quality: "A lead needs a real name, public source URL, service interest, research evidence, and a usable business email or phone with country code. Confirm relevant outreach eligibility and mark the source verified. Profile-only, duplicate, suppressed and unverified records do not count toward the daily target.",
  handoff: "Save the verified contact in Contacts & Calls. Eligible leads route to an available call representative automatically. If the representative is away, the lead stays in research until they return or a manager distributes it. Open the call queue to find unscheduled new leads and overdue follow-ups.",
  calls: "Review the source and eligibility, then call, open WhatsApp, or prepare an individual email. Opening WhatsApp is not proof of contact. Record notes and evidence only after actual contact; log unsuccessful attempts in notes and set the next call. All schedules use India time.",
  rewards: "Researcher and caller attribution stay separate. Adding a lead or changing its stage does not create earnings. Share the assigned caller's tracked signup link when appropriate; rewards depend on the existing verified-payment and reconciliation policy.",
  finish: "Daily research and contact tasks complete from real CRM progress. You cannot finish them with an unchecked claim. Targets reset each India calendar day; unmet previous-day tasks remain visible for accountability. Flag blockers in My Work if you cannot meet the target.",
};
export function DailyGuide({ api, revision, name, navigate, onAdd, onTask }: { api: Api; revision: unknown; name: string; navigate: (module: string) => void; onAdd: () => void; onTask: (id: string) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null), [error, setError] = useState("");
  const [topic, setTopic] = useState<keyof typeof answers>("quality");
  useEffect(() => { let active = true; api<Plan>("acquisition-daily-plan").then(data => { if (active) { setPlan(data); setError(""); } }).catch(cause => { if (active) setError(cause.message); }); return () => { active = false; }; }, [api, revision]);
  if (!plan && !error) return null;
  const researcher = plan?.workRole === "researcher", caller = plan?.workRole === "caller";
  const target = researcher ? plan?.researchTarget || 15 : plan?.callTarget || 45;
  const actual = researcher ? plan?.researched || 0 : plan?.called || 0;
  return <section className={styles.guide} aria-label="Team guiding assistant"><header><div><Compass size={20}/><span>TEAM GUIDE <small>{plan?.day} · India time</small></span></div><span>{plan?.owner ? "Owner oversight" : researcher ? "Researcher" : caller ? "Call representative" : "Team member"}</span></header>
    <div className={styles.body}><div><h2>{plan?.owner ? "Your team has a clear daily plan." : `${name.split(" ")[0]}, here is your next step.`}</h2><p>{plan?.owner ? `Owners supervise without personal work assignments. Today's team intake: ${plan.teamIntake || 0} leads. Check employee targets and blockers below.` : researcher ? `Add ${target} verified, contactable leads today. ${Math.max(0, target - actual)} remaining. Your researcher credit stays with you when the lead moves to the caller.` : caller ? `${plan?.ready || 0} eligible leads in your queue, ${plan?.overdue || 0} overdue follow-ups. Work new contacts and reschedule the next step after every conversation.` : "Open My Work for your assignments and use Contacts & Calls for researched contacts."}</p>
      {(researcher || caller) && <div className={styles.progress}><progress aria-label="Today's CRM progress" max={target} value={actual}/><strong>{actual} / {target} {researcher ? "leads" : "contacts reached"}</strong></div>}
      <div className={styles.actions}>{researcher ? <button onClick={onAdd}><Search size={15}/>Add researched lead</button> : <button onClick={() => navigate("acquisition")}><Phone size={15}/>{plan?.owner ? "Review CRM" : "Open contacts & calls"}</button>}<button onClick={() => navigate("work")}>My tasks<ArrowRight size={14}/></button><button onClick={() => navigate("calendar")}>Calendar</button></div>
    </div><div className={styles.steps}><h3><CheckCircle2 size={16}/>Assigned work</h3>{plan?.tasks.length ? plan.tasks.slice(0, 4).map(task => <button key={task.id} onClick={() => onTask(task.id)}>{task.title}<ArrowRight size={14}/></button>) : <p>{plan?.owner ? "No employee tasks assigned to you." : "No open assignments. Your daily work appears automatically."}</p>}</div></div>
    <details><summary><ShieldCheck size={15}/>Ask the guide</summary><nav aria-label="Guide questions">{([["quality", "What counts as a lead?"], ["handoff", "How do I hand off?"], ["calls", "How do I record a call?"], ["rewards", "How do credits work?"], ["finish", "How do I finish today's work?"]] as const).map(([key, title]) => <button key={key} aria-pressed={topic === key} onClick={() => setTopic(key)}>{title}</button>)}</nav><p role="status">{answers[topic]}</p></details>{error ? <p role="alert">{error}</p> : null}
  </section>;
}
