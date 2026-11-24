type ReleaseIdentity = { id: number; title: string; artistName: string };
const key = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Keep original artist credits; normalize only comparison keys. */
export function diverseHomeReleases<T extends ReleaseIdentity>(releases: T[]) {
  const groups = new Map<string, T[]>();
  const ids = new Set<number>();
  const recordings = new Set<string>();
  for (const release of releases) {
    const recording = JSON.stringify([key(release.artistName), key(release.title)]);
    if (ids.has(release.id) || recordings.has(recording)) continue;
    ids.add(release.id); recordings.add(recording);
    const artist = key(release.artistName);
    const group = groups.get(artist) || [];
    group.push(release); groups.set(artist, group);
  }
  const buckets = [...groups.values()];
  const result: T[] = [];
  for (let index = 0; buckets.some(group => index < group.length); index++) {
    for (const group of buckets) if (group[index]) result.push(group[index]);
  }
  return result;
}

export function homeReleaseRows<T extends ReleaseIdentity>(releases: T[]) {
  const unique = diverseHomeReleases(releases);
  const count = Math.min(3, unique.length);
  const rows: T[][] = Array.from({ length: count }, () => []);
  unique.forEach((release, index) => {
    // Shift the receiving row each column so artist groups cannot repeatedly
    // land in the same lane when the number of artists is a multiple of three.
    rows[(index % count + Math.floor(index / count)) % count].push(release);
  });
  return rows;
}
