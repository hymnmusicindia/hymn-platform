"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Phone, UserRound } from "lucide-react";
import { whatsappLink } from "@/lib/team/phone";
import { CustomerWorkActions } from "./customer-work-actions";
import styles from "./contact-record.module.css";

type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  owner: { id: string; name: string };
};
type HistoryItem = {
  id: string;
  type: "interaction" | "consultation";
  occurredAt: string;
  authorName: string;
  authorRole: string;
  outcome: string;
  discussion: string;
  nextAction: string;
  nextAt: string;
  source: string;
};
type Profile = {
  contact: Contact;
  nextAction: {
    id: string;
    title: string;
    status?: string;
    dueAt: string | null;
    ownerName: string;
    type: "task" | "calendar";
  } | null;
  consultations: {
    id: string;
    status: string;
    preferredCallback: string | null;
    assignedMemberName: string | null;
  }[];
  actions: { id: string; title: string; status: string; version: number; ownerId: string; ownerName: string; dueAt: string | null; isCall: boolean; canManage: boolean; journey: { label: string; attempts: number }; booking: { kind: string; googleMeetUrl: string | null; googleSyncStatus: string; googleSyncError: string | null } | null }[];
  history: HistoryItem[];
};
type Api = <T>(resource: string, body?: unknown) => Promise<T>;

const dateLabel = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " IST"
  : "Not scheduled";

export function TeamContactRecord({
  api,
  clientId,
  workspaceId,
  returnHref,
  returnLabel,
  onEdit,
  revision,
  canCall = false,
}: {
  api: Api;
  clientId: string;
  workspaceId: string;
  returnHref: string;
  returnLabel: string;
  onEdit: () => void;
  revision: number;
  canCall?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Profile>(`contact-profile?clientId=${encodeURIComponent(clientId)}`)
      .then(result => {
        if (active) {
          setProfile(result);
          setError("");
        }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Contact record could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api, clientId, refreshVersion, revision]);

  if (loading && !profile) return <section className={styles.record} aria-busy="true"><p>Loading contact record…</p></section>;
  if (error && !profile) return <section className={styles.record}><p role="alert">{error}</p><Link href={returnHref}><ArrowLeft size={15}/>Back to {returnLabel}</Link></section>;
  if (!profile) return null;

  const contact = profile.contact;
  const phone = contact.phone.replace(/[^\d+]/g, "");
  const whatsapp = whatsappLink(contact.phone);
  const returnQuery = new URLSearchParams({ workspace: workspaceId, module: "contacts" });
  const activityHref = new URLSearchParams({ workspace: workspaceId, module: "work-station", client: contact.id, returnModule: "contacts", returnId: contact.id, returnParam: "client" });
  const nextHref = profile.nextAction?.type === "task"
    ? `/team?${new URLSearchParams({ workspace: workspaceId, module: "work", task: profile.nextAction.id, returnModule: "contacts", returnId: contact.id, returnParam: "client" })}`
    : profile.nextAction?.type === "calendar"
      ? `/team?${new URLSearchParams({ workspace: workspaceId, module: "calendar", client: contact.id, returnModule: "contacts", returnId: contact.id, returnParam: "client" })}`
      : "";
  const consultationHref = profile.consultations[0]
    ? `/team?${new URLSearchParams({ workspace: workspaceId, module: "consultations", consultation: profile.consultations[0].id })}`
    : "";
  const lastInteraction = profile.history[0];

  return <section className={styles.record} aria-labelledby="contact-record-title">
    <header className={styles.header}>
      <Link href={returnHref}><ArrowLeft size={15}/>Back to {returnLabel}</Link>
      <button type="button" onClick={() => onEdit()}>Edit contact</button>
    </header>
    {error ? <p role="alert">{error}</p> : null}
    <section className={styles.identity}>
      <span className={styles.avatar} aria-hidden="true">{contact.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <p className={styles.eyebrow}>SHARED CONTACT RECORD</p>
        <h2 id="contact-record-title">{contact.name}</h2>
        <p>{contact.email || "No email"} · {contact.phone || "No phone"}</p>
      </div>
      <span className={styles.status} data-status={contact.status}>{contact.status.replaceAll("_", " ")}</span>
    </section>

    <div className={styles.actions} aria-label="Quick contact actions">
      {phone ? <a href={`tel:${phone}`}><Phone size={15}/>Call</a> : null}
      {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/>WhatsApp</a> : null}
      {contact.email ? <a href={`mailto:${encodeURIComponent(contact.email)}`}><Mail size={15}/>Email</a> : null}
      <Link href={`/team?${activityHref}`}><UserRound size={15}/>Start activity</Link>
      {canCall && contact.status === "ACTIVE" ? <CustomerWorkActions api={api} clientId={contact.id} canHandoff={false} onSaved={() => setRefreshVersion(value => value + 1)}/> : null}
    </div>

    <div className={styles.summary}>
      <article><span>Owner</span><strong>{contact.owner.name || "Unassigned"}</strong></article>
      <article><span>Status</span><strong>{contact.status.replaceAll("_", " ")}</strong></article>
      <article><span>Last interaction</span><strong>{lastInteraction ? dateLabel(lastInteraction.occurredAt) : "No recorded interaction"}</strong></article>
    </div>

    <section className={styles.next} aria-labelledby="contact-next-action">
      <div><p className={styles.eyebrow}>HANDOFF</p><h3 id="contact-next-action">Next action</h3></div>
      {profile.nextAction ? <>
        <div><strong>{profile.nextAction.title}</strong><p>{dateLabel(profile.nextAction.dueAt)} · Owner: {profile.nextAction.ownerName || "Unassigned"}</p></div>
        {nextHref ? <Link href={nextHref}>Open action</Link> : null}
      </> : profile.consultations[0] ? <>
        <div><strong>Consultation · {profile.consultations[0].status.replaceAll("_", " ")}</strong><p>{dateLabel(profile.consultations[0].preferredCallback)} · Owner: {profile.consultations[0].assignedMemberName || "Unassigned"}</p></div>
        <Link href={consultationHref}>Open consultation</Link>
      </> : <p>No upcoming action is scheduled.</p>}
    </section>

    <section className={styles.consultations}><h3>Open work & next conversations</h3>
      {profile.actions?.length ? profile.actions.map(action => <article key={action.id}>
        <strong>{action.title}</strong><span>{action.ownerName || "Unassigned"} ? {dateLabel(action.dueAt)}</span>
        {action.isCall ? <span>{action.journey.label} ? {action.journey.attempts} attempts recorded</span> : null}
        {action.booking?.googleMeetUrl ? <a href={action.booking.googleMeetUrl} target="_blank" rel="noopener noreferrer">Join Google Meet</a> : action.booking?.kind === "CALL" ? <span>Calendar: {action.booking.googleSyncStatus.replaceAll("_", " ")}</span> : null}
        {action.booking?.googleSyncError ? <small>{action.booking.googleSyncError}</small> : null}
        <Link href={`/team?${new URLSearchParams({ workspace: workspaceId, module: "work-station", task: action.id })}`}>Open work</Link>
        {action.canManage ? <CustomerWorkActions api={api} task={action} confirmed={action.booking?.kind === "CALL"} canSchedule={canCall && action.isCall} onSaved={() => setRefreshVersion(value => value + 1)}/> : null}
      </article>) : <p>No open work.</p>}
    </section>
    {profile.consultations.length ? <section className={styles.consultations}>
      <h3>Consultation requests</h3>
      {profile.consultations.map(item => <article key={item.id}>
        <strong>{item.status.replaceAll("_", " ")}</strong>
        <span>{dateLabel(item.preferredCallback)} · {item.assignedMemberName || "Unassigned"}</span>
        <Link href={`/team?${new URLSearchParams({ workspace: workspaceId, module: "consultations", consultation: item.id })}`}>Open request</Link>
      </article>)}
    </section> : null}

    <section className={styles.history} aria-labelledby="contact-history-title">
      <header><div><p className={styles.eyebrow}>SHARED HISTORY</p><h3 id="contact-history-title">Recent interactions</h3></div><Link href={`/team?${returnQuery}`}>Contacts</Link></header>
      {!profile.history.length ? <p>No shared interactions have been recorded yet.</p> : profile.history.map(item => <article key={`${item.type}:${item.id}`}>
        <div><strong>{item.outcome.replaceAll("_", " ") || "Interaction"}</strong><span>{dateLabel(item.occurredAt)}</span></div>
        <small>{item.authorName}{item.authorRole ? ` · ${item.authorRole}` : ""}{item.source ? ` · ${item.source.replaceAll("_", " ")}` : ""}</small>
        <p>{item.discussion || "No notes recorded."}</p>
        {item.nextAction ? <p><strong>Next:</strong> {item.nextAction}{item.nextAt ? ` · ${dateLabel(item.nextAt)}` : ""}</p> : null}
      </article>)}
    </section>
  </section>;
}
