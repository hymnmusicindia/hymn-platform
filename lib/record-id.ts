/** IDs use PostgreSQL signed 32-bit integers; reject coercion and overflow before queries. */
export function recordId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= 2147483647 ? id : null;
}
