import { customerBrandText } from '@/lib/customer-message';
import type { ReleaseQcReport } from '@/lib/direnote-qc-details';

/** Format provider commentary without changing saved evidence or matched rights holders. */
export function customerQcReport(report: ReleaseQcReport | null): ReleaseQcReport | null {
  if (!report) return null;
  return { ...report, tracks: report.tracks.map(track => ({
    ...track,
    isrcLookup: customerBrandText(track.isrcLookup),
    upcLookup: customerBrandText(track.upcLookup),
    aiPrediction: customerBrandText(track.aiPrediction),
    notes: track.notes.map(note => customerBrandText(note))
  })) };
}
