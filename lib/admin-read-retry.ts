/** Retry only temporary connection failures, never authorization or data errors. */
export async function retryAdminRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    const details = error && typeof error === "object" ? error as { code?: unknown; errorCode?: unknown; name?: string; message?: string } : {};
    const code = details.code ?? details.errorCode;
    const initializationConnectionFailure = details.name === "PrismaClientInitializationError" && /Can't reach database server|Timed out fetching a new connection|Connection terminated/i.test(details.message ?? "");
    if (!initializationConnectionFailure && !["P1001", "P1002", "P1008", "P1017", "P2024"].includes(String(code))) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    return read();
  }
}
