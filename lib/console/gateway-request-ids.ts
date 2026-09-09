/** PymtHouse usage/requests accepts at most 50 `gatewayRequestId` values. */
export const MAX_GATEWAY_REQUEST_IDS = 50;

/**
 * Unique ids for a Cost lookup, capped at the usage API limit.
 * `prefer` is kept when the page is already full (open detail off the page).
 */
export function takeGatewayRequestIds(
  ids: Iterable<string>,
  prefer?: string | null
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const id = raw.trim();
    if (!id || seen.has(id) || out.length >= MAX_GATEWAY_REQUEST_IDS) return;
    seen.add(id);
    out.push(id);
  };
  if (prefer) push(prefer);
  for (const id of ids) push(id);
  return out;
}
