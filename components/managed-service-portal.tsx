"use client";

import { useMemo, useState } from "react";

type Release = { id: number; title: string; artistName: string; status: string; tracks: { id: number; title: string }[] };
type RequestRow = { id: number; serviceType: string; status: string; userVisibleUpdate?: string | null; externalReference?: string | null; release: { title: string }; documents: { asset: { id: number; safeFilename: string } }[]; providerStatuses?: { id: number; provider: string; status: string; reference?: string | null }[] };
type ServiceType = "CRBT_CALLER_TUNE" | "YOUTUBE_OAC" | "YOUTUBE_CONTENT_ID";

const services: Record<ServiceType, { label: string; description: string; eligibility: string; process: string }> = {
  CRBT_CALLER_TUNE: { label: "Caller Tune / CRBT", description: "Request caller-tune delivery support for an eligible released recording.", eligibility: "Released track, valid identifiers and caller-tune rights required.", process: "HYMN reviews the track and submits eligible requests to the selected telecom partner." },
  YOUTUBE_OAC: { label: "YouTube Official Artist Channel", description: "Request help linking an eligible artist channel and YouTube topic channel.", eligibility: "Controlled artist channel, topic channel and distributed catalogue links required.", process: "HYMN reviews eligibility before coordinating a partner submission." },
  YOUTUBE_CONTENT_ID: { label: "YouTube Content ID", description: "Request an eligibility review for YouTube rights-management delivery.", eligibility: "Exclusive, sufficiently original and rights-controlled recordings only.", process: "HYMN reviews rights risks before any partner submission; approval is not guaranteed." },
};
const timeline = ["Submitted", "Eligibility review", "Information required", "Approved", "Submitted to partner", "Completed"];
const contentIdChecks = [["exclusiveRights", "I exclusively control the recording rights"], ["samplesOrLoops", "The recording uses samples or loops"], ["widelyLicensedLoops", "It uses widely licensed loops"], ["nonExclusiveBeat", "It uses a non-exclusive beat"], ["coverRecording", "It is a cover recording"], ["coverRightsConfirmed", "Required cover rights are confirmed"], ["enrolledElsewhere", "It is registered in Content ID elsewhere"], ["conflictingClaims", "There are current conflicting claims"]] as const;

function timelineIndex(status: string) {
  const normalized = status.toLowerCase();
  if (/complete/.test(normalized)) return 5;
  if (/partner|provider/.test(normalized)) return 4;
  if (/approved/.test(normalized)) return 3;
  if (/information|required|changes/.test(normalized)) return 2;
  if (/review|eligibility/.test(normalized)) return 1;
  return 0;
}

export function ManagedServicePortal({ releases, initialRequests }: { releases: Release[]; initialRequests: RequestRow[] }) {
  const [items, setItems] = useState(initialRequests);
  const [releaseId, setReleaseId] = useState(releases[0]?.id || 0);
  const release = useMemo(() => releases.find((row) => row.id === releaseId), [releases, releaseId]);
  const [trackId, setTrackId] = useState(0);
  const [serviceType, setServiceType] = useState<ServiceType>("CRBT_CALLER_TUNE");
  const [provider, setProvider] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [declared, setDeclared] = useState(false);
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  async function upload(file?: File) {
    if (!file || !releaseId) return;
    setBusy(true); setMessage("Uploading private evidence…");
    const form = new FormData(); form.set("file", file); form.set("assetType", "private_ownership_proof"); form.set("releaseId", String(releaseId));
    const response = await fetch("/api/assets", { method: "POST", body: form });
    const data = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setMessage(data.error || "Upload failed.");
    setAssetIds((current) => [...current, data.asset.id]); setMessage(`Private document attached (${data.asset.byteSize} bytes).`);
  }

  function answers() {
    if (serviceType === "CRBT_CALLER_TUNE") return { telecomProviders: String(values.telecomProviders || "").split(",").map((value) => value.trim()).filter(Boolean), startPointSeconds: Number(values.startPointSeconds), language: String(values.language || ""), releaseStatus: release?.status || "unknown", isrc: String(values.isrc || ""), upc: String(values.upc || ""), rightsConfirmed: values.rightsConfirmed === true, desiredCallerTuneTitle: String(values.desiredCallerTuneTitle || "") };
    if (serviceType === "YOUTUBE_OAC") return { artistName: String(values.artistName || release?.artistName || ""), artistChannelUrl: String(values.artistChannelUrl || ""), topicChannelUrl: String(values.topicChannelUrl || ""), distributedReleaseLinks: String(values.distributedReleaseLinks || "").split(",").map((value) => value.trim()).filter(Boolean), channelOwnershipConfirmed: values.channelOwnershipConfirmed === true, supportingEvidence: String(values.supportingEvidence || "") };
    return { ownershipType: String(values.ownershipType || ""), exclusiveRights: values.exclusiveRights === true, samplesOrLoops: values.samplesOrLoops === true, widelyLicensedLoops: values.widelyLicensedLoops === true, nonExclusiveBeat: values.nonExclusiveBeat === true, beatLicenseType: String(values.beatLicenseType || "not_applicable"), coverRecording: values.coverRecording === true, coverRightsConfirmed: values.coverRightsConfirmed === true, enrolledElsewhere: values.enrolledElsewhere === true, conflictingClaims: values.conflictingClaims === true, territory: String(values.territory || "Worldwide") };
  }

  async function submit() {
    if (!releaseId || !declared) return setMessage("Select a release and accept the rights declaration.");
    setBusy(true); setMessage("Submitting for manual review…");
    const response = await fetch("/api/managed-services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId, trackId: trackId || undefined, serviceType, provider: provider || undefined, documentAssetIds: assetIds, requestKey, answers: answers(), declarations: { rightsAccuracyConfirmed: declared, manualProcessingAccepted: true } }) });
    const envelope = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok || !envelope.success) return setMessage(envelope.error?.message || "Request failed. You can retry without creating a duplicate.");
    setItems((current) => [{ ...envelope.data.request, release: { title: release?.title || "Release" }, documents: [], providerStatuses: [] }, ...current]);
    setRequestKey(crypto.randomUUID()); setMessage(envelope.data.message);
  }

  return <div className="mt-6 grid gap-6">
    <section className="grid gap-4 md:grid-cols-3">{(Object.keys(services) as ServiceType[]).map((key) => { const meta = services[key]; const current = items.find((item) => item.serviceType === key); return <button key={key} type="button" onClick={() => { setServiceType(key); setValues({}); }} className="surface-card pressable min-h-64 p-5 text-left" style={{ borderColor: serviceType === key ? "var(--accent)" : "var(--border)" }}><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{meta.label}</h2><span className="status-pill" style={{ color: "var(--info)" }}>Managed by HYMN</span></div><p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>{meta.description}</p><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Eligibility</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{meta.eligibility}</p><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Process</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{meta.process}</p><p className="mt-4 text-xs" style={{ color: current ? "var(--success)" : "var(--text-soft)" }}>{current ? `Current request: ${current.status.replace(/_/g, " ")}` : "No current request"}</p></button>; })}</section>
    <section className="surface-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">New manually processed request</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>HYMN reviews eligibility and coordinates approved requests manually with external partners.</p></div><span className="status-pill" style={{ color: "var(--info)" }}>Managed by HYMN</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Release<select className="input" value={releaseId} onChange={(event) => { setReleaseId(Number(event.target.value)); setTrackId(0); setAssetIds([]); }}><option value={0}>Select a release</option>{releases.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.artistName}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">Service<select className="input" value={serviceType} onChange={(event) => { setServiceType(event.target.value as ServiceType); setValues({}); }}>{(Object.keys(services) as ServiceType[]).map((key) => <option key={key} value={key}>{services[key].label}</option>)}</select></label></div>
      {serviceType === "CRBT_CALLER_TUNE" ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Track<select className="input" value={trackId} onChange={(event) => setTrackId(Number(event.target.value))}><option value={0}>Select track</option>{release?.tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>{[["telecomProviders", "Telecom providers"], ["startPointSeconds", "Start point in seconds"], ["language", "Language"], ["isrc", "Track ISRC"], ["upc", "Release UPC"], ["desiredCallerTuneTitle", "Caller-tune title"]].map(([key, label]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}<input className="input" type={key === "startPointSeconds" ? "number" : "text"} value={String(values[key] || "")} onChange={(event) => patch(key, event.target.value)} /></label>)}<label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={values.rightsConfirmed === true} onChange={(event) => patch("rightsConfirmed", event.target.checked)} />I control the necessary caller-tune rights.</label></div> : null}
      {serviceType === "YOUTUBE_OAC" ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{[["artistName", "Artist name"], ["artistChannelUrl", "Artist channel URL"], ["topicChannelUrl", "Topic channel URL (optional)"], ["distributedReleaseLinks", "Distributed release links"], ["supportingEvidence", "Supporting evidence summary"]].map(([key, label]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}<input className="input" value={String(values[key] || (key === "artistName" ? release?.artistName || "" : ""))} onChange={(event) => patch(key, event.target.value)} /></label>)}<label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={values.channelOwnershipConfirmed === true} onChange={(event) => patch("channelOwnershipConfirmed", event.target.checked)} />I confirm ownership or control of the artist channel.</label></div> : null}
      {serviceType === "YOUTUBE_CONTENT_ID" ? <div className="mt-5 grid gap-4"><div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)", color: "var(--text-muted)" }}><strong style={{ color: "var(--text)" }}>Eligibility risks</strong><p className="mt-2">Non-exclusive beats, common or widely licensed loops, cover songs, existing claims, and content registered elsewhere may be ineligible or create conflicting claims.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Ownership type<input className="input" value={String(values.ownershipType || "")} onChange={(event) => patch("ownershipType", event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold">Beat licence type<input className="input" value={String(values.beatLicenseType || "")} onChange={(event) => patch("beatLicenseType", event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold">Territory<input className="input" value={String(values.territory || "Worldwide")} onChange={(event) => patch("territory", event.target.value)} /></label>{contentIdChecks.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={values[key] === true} onChange={(event) => patch(key, event.target.checked)} />{label}</label>)}</div></div> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Preferred provider / platform <span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Optional</span><input className="input" value={provider} onChange={(event) => setProvider(event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold">Private supporting document <span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Optional unless HYMN requests evidence</span><input className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => upload(event.target.files?.[0])} /></label></div>
      <label className="mt-5 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={declared} onChange={(event) => setDeclared(event.target.checked)} />I confirm these answers are accurate and understand this is a manual, eligibility-dependent service with no activation guarantee.</label><button className="btn-primary pressable mt-4" disabled={busy} type="button" onClick={submit}>{busy ? "Working…" : "Submit for manual review"}</button><p className="mt-2 text-sm" aria-live="polite" style={{ color: "var(--text-muted)" }}>{message}</p>
    </section>
    <section className="grid gap-4"><h2 className="text-xl font-semibold">Request history and status</h2>{items.length === 0 ? <p className="surface-card text-sm">No managed-service requests yet. Select a service above to review eligibility and start a request.</p> : null}{items.map((item) => { const activeIndex = timelineIndex(item.status); return <article className="surface-card" key={item.id}><div className="flex flex-wrap justify-between gap-3"><div><strong>{services[item.serviceType as ServiceType]?.label || item.serviceType} · {item.release.title}</strong><p className="mt-1 text-xs" style={{ color: "var(--info)" }}>Managed by HYMN</p></div><span className="status-pill capitalize">{item.status.replace(/_/g, " ")}</span></div><ol className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{timeline.map((label, index) => <li key={label} className="text-xs"><span className="mb-2 block h-2.5 w-2.5 rounded-full" style={{ background: index < activeIndex ? "var(--success)" : index === activeIndex ? "var(--info)" : "var(--border-strong)" }} /><span style={{ color: index <= activeIndex ? "var(--text)" : "var(--text-soft)" }}>{label}</span></li>)}</ol>{item.userVisibleUpdate ? <p className="mt-4 text-sm">{item.userVisibleUpdate}</p> : null}{item.externalReference ? <p className="mt-2 font-mono text-xs">Partner reference: {item.externalReference}</p> : null}{item.providerStatuses?.map((row) => <p className="mt-2 text-sm" key={row.id}>{row.provider}: {row.status}{row.reference ? ` · ${row.reference}` : ""}</p>)}{item.documents?.map((row) => <a className="mt-2 block underline" href={`/api/assets/${row.asset.id}/download`} key={row.asset.id}>{row.asset.safeFilename}</a>)}</article>; })}</section>
  </div>;
}

// vercel trigger 11
