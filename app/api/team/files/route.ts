import { isSameAppOrigin } from "@/lib/request-origin";
import { teamActor } from "@/lib/team/access";
import { TeamError, demand } from "@/lib/team/policy";
import { scopedAttachment } from "@/lib/team/advanced";
import { teamWrite, audit } from "@/lib/team/service";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function fail(error: unknown) { return Response.json({ error: error instanceof TeamError ? error.message : "File operation could not be completed." }, { status: error instanceof TeamError ? error.status : 503, headers }); }
export async function POST(request: Request) {
  let assetId: number | undefined; let userId: number | undefined;
  try {
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    const a = await teamActor(new URL(request.url).searchParams.get("workspace") || undefined); userId = a.userId; demand(a, "tasks.update");
    if (!(await consumeRateLimit({ scope: "team-files", identity: a.id, limit: 20, windowSeconds: 3600 })).allowed) throw new TeamError("Upload limit reached. Try again later.", 429);
    if (Number(request.headers.get("content-length") || 0) > 26 * 1024 * 1024) throw new TeamError("Maximum attachment size is 25 MB.", 413);
    const form = await request.formData(); const file = form.get("file"); const taskId = String(form.get("taskId") || "") || null; const projectId = String(form.get("projectId") || "") || null; const sensitive = form.get("sensitive") === "true";
    if (!(file instanceof File) || file.size < 1 || file.size > 25 * 1024 * 1024) throw new TeamError("Choose a file between 1 byte and 25 MB.");
    if (sensitive && !a.role.owner) throw new TeamError("Only the owner can upload sensitive rights, contract or financial documents.", 403);
    await scopedAttachment(a, { taskId, projectId });
    const stored = await localPrivateStorage.upload({ ownerUserId: a.userId, assetType: "private_team_attachment", fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) }); assetId = stored.id;
    const row = await teamWrite(a, async (tx, current) => { demand(current, "tasks.update"); await scopedAttachment(current, { taskId, projectId }, tx); if (sensitive && !current.role.owner) throw new TeamError("Owner access required.", 403); const attachment = await tx.teamAttachment.create({ data: { workspaceId: a.workspaceId, uploadedById: a.id, taskId, projectId, assetId: stored.id, filename: file.name.replace(/[\r\n\0]/g, "").slice(0, 200), mimeType: file.type, sizeBytes: file.size, sensitive } }); await audit(tx, current, "attachment.uploaded", attachment.id, { taskId, projectId, sensitive }); return attachment; });
    return Response.json(row, { headers });
  } catch (error) {
    if (assetId && userId) await localPrivateStorage.delete({ assetId, requesterUserId: userId, isAdmin: false }).catch(() => undefined);
    return fail(error);
  }
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const a = await teamActor(url.searchParams.get("workspace") || undefined);
    const attachment = await prisma.teamAttachment.findFirst({ where: { id: url.searchParams.get("id") || "", workspaceId: a.workspaceId } });
    if (!attachment) throw new TeamError("Attachment unavailable.", 404);
    await scopedAttachment(a, attachment); if (attachment.sensitive && !a.role.owner) throw new TeamError("Sensitive attachment requires owner access.", 403);
    // The domain policy above authorises exactly this team-owned asset, not
    // arbitrary StoredAsset IDs supplied by the client.
    const asset = await prisma.storedAsset.findUnique({ where: { id: attachment.assetId }, select: { assetType: true } });
    if (asset?.assetType !== "private_team_attachment") throw new TeamError("Attachment unavailable.", 404);
    const read = await localPrivateStorage.createAuthorizedRead({ assetId: attachment.assetId, requesterUserId: a.userId, isAdmin: true });
    await teamWrite(a, (tx, current) => audit(tx, current, "attachment.downloaded", attachment.id));
    return new Response(new Uint8Array(read.bytes), { headers: { ...headers, "Content-Type": read.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}` } });
  } catch (error) { return fail(error); }
}
