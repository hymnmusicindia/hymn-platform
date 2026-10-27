export const releaseDocumentPolicies = {
  private_ownership_proof: { category: "RELEASE_LICENSE_RECEIPT", maxBytes: 10 * 1024 * 1024, mimeTypes: ["application/pdf"] },
  private_ai_receipt: { category: "RELEASE_AI_RECEIPT", maxBytes: 10 * 1024 * 1024, mimeTypes: ["application/pdf"] },
  private_cover_licence: { category: "TRACK_COVER_LICENSE", maxBytes: 20 * 1024 * 1024, mimeTypes: ["application/pdf", "image/jpeg", "image/png"] },
} as const;
export type ReleaseDocumentType = keyof typeof releaseDocumentPolicies;
export const documentChunkSize = 512 * 1024;
export function documentPolicyForCategory(category: string) {
  return Object.entries(releaseDocumentPolicies).find(([, policy]) => policy.category === category) as [ReleaseDocumentType, (typeof releaseDocumentPolicies)[ReleaseDocumentType]] | undefined;
}
