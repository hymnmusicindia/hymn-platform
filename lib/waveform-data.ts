/** Compact, versioned envelope shared by the API and the selected-track player. */
export const WAVEFORM_BINS = 128;
export type WaveformData = { version: 1; duration: number; peaks: number[] };

export function validWaveform(value: unknown): value is WaveformData {
  const data = value as WaveformData | null;
  return Boolean(data && data.version === 1 && Number.isFinite(data.duration) && data.duration > 0
    && Array.isArray(data.peaks) && data.peaks.length === WAVEFORM_BINS
    && data.peaks.every(peak => Number.isInteger(peak) && peak >= 0 && peak <= 255));
}
