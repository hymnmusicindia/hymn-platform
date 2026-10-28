// Retry reads only. Replaying a Team mutation could duplicate business activity.
const transientCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2037"]);

export function teamDatabaseErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const value = error as { code?: unknown; errorCode?: unknown };
  const code = value.code ?? value.errorCode;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : "UNKNOWN";
}

export async function recoverTeamRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!transientCodes.has(teamDatabaseErrorCode(error))) throw error;
    await new Promise(resolve => setTimeout(resolve, 300));
    return read();
  }
}
