import "server-only";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import type { EmailAttachment } from "./email-client";

// Keep raw files below 10 MiB: MIME/base64 expands the transmitted message.
export async function purchaseAttachments(purchaseId: number, userId: number, recipient: string): Promise<EmailAttachment[]> {
  const purchase = await prisma.beatPurchase.findFirst({
    where: { id: purchaseId, userId, hasAccess: true },
    include: { user: { select: { email: true } }, licenseAsset: true, beat: { include: { deliverableAsset: true } } }
  });
  if (!purchase || purchase.user.email.toLowerCase() !== recipient.toLowerCase()) return [];
  const result: EmailAttachment[] = [];
  let remaining = 10 * 1024 * 1024;
  for (const asset of [purchase.licenseAsset, purchase.beat.deliverableAsset]) {
    if (!asset || asset.deletedAt || Number(asset.byteSize) > remaining) continue;
    // Do not deliver a higher-tier format with a lower-tier purchase.
    if (asset === purchase.beat.deliverableAsset) {
      const type = purchase.licenseType.toLowerCase();
      const allowed = asset.mimeType === "audio/mpeg" ||
        (["wav", "stems", "exclusive", "general", "premium"].includes(type) && ["audio/wav", "audio/x-wav", "audio/flac"].includes(asset.mimeType)) ||
        (["stems", "exclusive"].includes(type) && asset.mimeType === "application/zip");
      if (!allowed) continue;
    }
    try {
      const file = await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: userId, isAdmin: false });
      if (file.bytes.length > remaining) continue;
      remaining -= file.bytes.length;
      result.push({ filename: file.fileName, content: file.bytes, contentType: file.mimeType });
    } catch {
      // The purchase email still provides the authenticated dashboard link.
      console.warn("Email attachment unavailable", { purchaseId, assetId: asset.id });
    }
  }
  return result;
}
