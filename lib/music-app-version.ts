export function musicAppNeedsUpdate(userAgent: string, latest: string): boolean {
  const current = /\bHYMNMusic\/(\d+\.\d+\.\d+)\b/.exec(userAgent)?.[1];
  if (!current || !/^\d+\.\d+\.\d+$/.test(latest)) return false;
  const a = current.split('.').map(Number), b = latest.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (!Number.isSafeInteger(a[index]) || !Number.isSafeInteger(b[index])) return false;
    if (a[index] !== b[index]) return b[index] > a[index];
  }
  return false;
}
