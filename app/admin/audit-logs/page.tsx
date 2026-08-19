import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { listAuditEvents } from "@/lib/audit-log";

type AuditLogRow = {
  id: number;
  createdAt: Date | string;
  actorType: string;
  actorId: number | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  riskLevel: string;
  reason: string | null;
  requestId: string | null;
};

function displayAuditLog(raw: unknown): AuditLogRow {
  const row = raw as Record<string, unknown>;
  const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  return {
    id: Number(row.id),
    createdAt: row.createdAt instanceof Date || typeof row.createdAt === "string" ? row.createdAt : new Date(),
    actorType: typeof row.actorType === "string" ? row.actorType : typeof metadata.actorType === "string" ? metadata.actorType : "system",
    actorId: typeof row.actorId === "number" ? row.actorId : null,
    actorRole: typeof row.actorRole === "string" ? row.actorRole : typeof metadata.actorRole === "string" ? metadata.actorRole : "",
    action: typeof row.action === "string" ? row.action : "",
    entity: typeof row.entity === "string" ? row.entity : typeof row.entityType === "string" ? row.entityType : "",
    entityId: row.entityId == null ? "" : String(row.entityId),
    riskLevel: typeof row.riskLevel === "string" ? row.riskLevel : typeof metadata.riskLevel === "string" ? metadata.riskLevel : "normal",
    reason: typeof row.reason === "string" ? row.reason : typeof metadata.reason === "string" ? metadata.reason : null,
    requestId: typeof row.requestId === "string" ? row.requestId : typeof metadata.requestId === "string" ? metadata.requestId : null,
  };
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPermission("audit.read");
  if ("error" in admin) redirect("/admin/login");
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const logs = (await listAuditEvents({ action: value("action") || undefined, entityType: value("entityType") || undefined, actorId: Number(value("actorId")) || undefined, riskLevel: value("riskLevel") || undefined, requestId: value("requestId") || undefined, cursor: Number(value("cursor")) || undefined, limit: 100 })).map(displayAuditLog);
  const exportQuery = new URLSearchParams(Object.entries(query).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : [])).toString();
  return <main className="mx-auto max-w-7xl p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Audit events</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Immutable security and administrator activity.</p></div><a className="btn-secondary" href={`/api/admin/audit-logs?${exportQuery}&format=csv`}>Export filtered CSV</a></div><form className="surface-card mt-6 grid gap-3 md:grid-cols-5"><input className="input" name="action" defaultValue={value("action")} placeholder="Action"/><input className="input" name="entityType" defaultValue={value("entityType")} placeholder="Entity type"/><input className="input" name="actorId" defaultValue={value("actorId")} placeholder="Actor ID" inputMode="numeric"/><input className="input" name="requestId" defaultValue={value("requestId")} placeholder="Request ID"/><select className="input" name="riskLevel" defaultValue={value("riskLevel")}><option value="">All risk levels</option>{["low", "normal", "high", "critical"].map(level => <option key={level}>{level}</option>)}</select><button className="btn-primary md:col-span-5" type="submit">Apply filters</button></form><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr>{["Time", "Actor", "Role", "Action", "Entity", "Risk", "Reason", "Request"].map(label => <th className="border-b p-3" key={label}>{label}</th>)}</tr></thead><tbody>{logs.map(log => <tr key={log.id}><td className="border-b p-3">{new Date(log.createdAt).toLocaleString("en-IN")}</td><td className="border-b p-3">{log.actorType}:{log.actorId ?? "system"}</td><td className="border-b p-3">{log.actorRole}</td><td className="border-b p-3">{log.action}</td><td className="border-b p-3">{log.entity}:{log.entityId}</td><td className="border-b p-3">{log.riskLevel}</td><td className="border-b p-3">{log.reason || "—"}</td><td className="border-b p-3">{log.requestId || "—"}</td></tr>)}</tbody></table>{logs.length === 0 ? <p className="surface-card mt-4">No audit events match these filters.</p> : null}</div>{logs.length === 100 ? <a className="btn-secondary mt-4" href={`?${exportQuery}&cursor=${logs.at(-1)?.id}`}>Older events</a> : null}</main>;
}
// vercel trigger 9

// vercel trigger 11
