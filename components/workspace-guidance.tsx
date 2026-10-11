"use client";
import { Check, ChevronRight, CircleHelp, Disc3, Radio, Upload, Wallet } from "lucide-react";
export type GuideStep = { label: string; href: string; state: "done" | "current" | "next"; hint: string };
export function WorkspaceGuidance({ title, steps }: { title: string; steps: GuideStep[] }) {
  const icons = [Upload, Disc3, Radio, Wallet];
  return <section className="workspace-guide" aria-label="Your workflow guide"><header><div><span className="workspace-kicker">Your next move</span><h2>{title}</h2></div><details><summary><CircleHelp size={16}/>Need a hand?</summary><div><a href="/faq">Quick answers</a><a href="/dashboard?tab=support">Get support</a></div></details></header><ol>{steps.map((step,index)=>{const Icon = icons[index % icons.length];return <li key={step.label} data-state={step.state}><a href={step.href} aria-current={step.state === "current" ? "step" : undefined}><span className="guide-step-icon">{step.state === "done" ? <Check size={18}/> : <Icon size={18}/>}</span><span><strong>{step.label}</strong><small>{step.hint}</small></span><ChevronRight size={15}/></a></li>;})}</ol></section>;
}
