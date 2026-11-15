/** At most three identity checks run together; failures drain active work before releasing the delivery lock. */
export async function runArtistMappingChecks(ids: number[], check: (id: number) => Promise<unknown>) {
  const pending = [...new Set(ids)];
  let index = 0;
  let failure: { cause: unknown } | undefined;
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (!failure && index < pending.length) {
      const id = pending[index++];
      try { await check(id); } catch (cause) { failure ??= { cause }; }
    }
  }));
  if (failure) throw failure.cause;
}
