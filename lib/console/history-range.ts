/** Request all available history explicitly, avoiding an upstream default
 * lookback. This is a query range, not a record or media retention policy. */
export function historyRange(now = new Date()): { from: string; to: string } {
  return {
    from: new Date(0).toISOString(),
    to: now.toISOString(),
  };
}
