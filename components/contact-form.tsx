"use client";
import { customerMessage } from "@/lib/customer-message";
import { FormEvent, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, RotateCcw } from "lucide-react";

export function ContactForm({ initialName = "", initialEmail = "" }: { initialName?: string; initialEmail?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [length, setLength] = useState(0);
  const pending = useRef(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    for (const key of ["name", "email", "message"]) payload[key] = String(payload[key] || "").trim();
    if (String(payload.name).length < 2 || String(payload.message).length < 10) { setError("Please enter your name and a message of at least 10 characters."); return; }
    pending.current = true; setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Your inquiry could not be sent. Please try again."); return; }
      setSent(true);
    } catch { setError("We couldn't send your inquiry. Your message is still here. Please try again."); }
    finally { pending.current = false; setSubmitting(false); }
  }
  if (sent) return <div className="contact-success" role="status"><span className="contact-success-icon"><Check size={24}/></span><h3>You&apos;re on our radar.</h3><p>Your inquiry has been received. The HYMN team can follow up using the email you provided.</p><button type="button" onClick={() => {setSent(false);setLength(0);setError(null);}}><RotateCcw size={15}/> Send another inquiry</button></div>;
  return <form className="contact-form" onSubmit={handleSubmit} aria-busy={submitting}>
    <label hidden aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <fieldset disabled={submitting}><legend className="sr-only">Your inquiry</legend><div className="contact-fields">
      <label>Your name<input name="name" autoComplete="name" defaultValue={initialName} placeholder="What should we call you?" minLength={2} maxLength={120} required/></label>
      <label>Email address<input aria-label="Email address" aria-describedby="contact-email-hint" name="email" type="email" autoComplete="email" defaultValue={initialEmail} placeholder="you@example.com" maxLength={254} required/><small id="contact-email-hint">We&apos;ll use this to get back to you.</small></label>
      <label>Artist / label <span>optional</span><input name="company" autoComplete="organization" placeholder="Your artist or label name" maxLength={160}/></label>
      <label>Phone / WhatsApp <span>optional</span><input name="phone" type="tel" autoComplete="tel" placeholder="Include your country code" maxLength={40}/></label>
      <label className="contact-field-wide">What is this about?<select aria-label="What is this about?" name="serviceInterest" defaultValue="" required><option value="" disabled>Select a topic</option>{["Music distribution", "Mixing / Mastering", "Beat licensing", "Partnerships", "Account or release support", "Something else"].map(topic => <option key={topic}>{topic}</option>)}</select></label>
      <label className="contact-field-wide">Your message<textarea aria-label="Your message" name="message" placeholder="Tell us about your project or what you need help with..." minLength={10} maxLength={5000} required onChange={e=>setLength(e.target.value.length)} aria-describedby="contact-message-hint"/><small id="contact-message-hint" className="contact-message-hint"><span>Include a release name or link if relevant.</span><span>{length.toLocaleString()} / 5,000</span></small></label>
    </div></fieldset>
    {error ? <p className="contact-error" role="alert">{customerMessage(error)}</p> : null}
    <div className="contact-form-footer"><p>Only share what we need to help.<br/>Please keep passwords and payment details private.</p><button type="submit" disabled={submitting}>{submitting ? <><LoaderCircle size={16} className="animate-spin"/> Sending...</> : <>Send inquiry <ArrowRight size={17}/></>}</button></div>
  </form>;
}
