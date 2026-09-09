/** Inclusive lookback that stays within PymtHouse MAX_DATE_RANGE_DAYS (365). */
export const HISTORY_MAX_DAYS = 365;

/** Request history for the last year. This is a query range, not a
 * record or media retention policy. */
export function historyRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getTime());
  from.setUTCDate(from.getUTCDate() - (HISTORY_MAX_DAYS - 1));
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}
