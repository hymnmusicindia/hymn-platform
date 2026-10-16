/** Exact provider-ID and changed-field matching. A missing field is not proof of clearing it. */
export function confirmsDireNoteIdentityChange(action: string, payload: Record<string, unknown>, response: Record<string, any>) {
  const isArtist = action === "update_artist";
  if (!isArtist && action !== "update_songwriter") return false;
  const identity = response[isArtist ? "artist" : "songwriter"];
  const id = isArtist ? "artist_id" : "songwriter_id";
  if (!identity || String(identity[id]) !== String(payload[id])) return false;
  return Object.entries(payload).filter(([key]) => key !== id).every(([key, expected]) => {
    const linkKey = key.endsWith("_url") ? key.slice(0, -4) : null;
    const container = linkKey ? identity.links : identity;
    const field = linkKey || key;
    if (!container || !(field in container)) return false;
    const actual = container[field];
    if (expected === null || expected === "") return actual === null || actual === "";
    return String(actual).trim().replace(/\/$/, "") === String(expected).trim().replace(/\/$/, "");
  });
}

export function confirmsDireNoteWithdrawal(payload: Record<string, unknown>, response: Record<string, any>) {
  const release = response.release || response;
  const upc = String(release.upc_code ?? release.upc ?? response.upc_code ?? response.upc ?? "").replace(/[\s-]/g, "");
  const tracks = response.tracks ?? release.tracks;
  return upc === payload.upc && Array.isArray(tracks) && tracks.length > 0 && tracks.every((track: Record<string, unknown>) => String(track.status).toLowerCase() === "rejected" && /withdrawn by user/i.test(String(track.remarks)));
}
