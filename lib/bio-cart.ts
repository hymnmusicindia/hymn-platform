import { normalizeBeatLicenseType, type BeatStoreLicenseType } from "@/lib/beat-store";
export type BioCartItem = { beatId:number; licenseType:BeatStoreLicenseType; price?:number };
export function readBioCart(): BioCartItem[] {
  try { return parseBioCart(window.localStorage.getItem("hymn-beat-cart")); } catch { return []; }
}
export function parseBioCart(raw: string | null): BioCartItem[] {
  try {
    const entries: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(entries)) return [];
    const unique = new Map<number,BioCartItem>();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const item=entry as BioCartItem;
      if (Number.isSafeInteger(item.beatId) && item.beatId>0 && ["mp3","wav","stems","exclusive","general","basic","premium"].includes(item.licenseType)) unique.set(item.beatId,{beatId:item.beatId,licenseType:normalizeBeatLicenseType(item.licenseType)});
    }
    return [...unique.values()];
  } catch { return []; }
}
