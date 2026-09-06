import type {
  AccessAction,
  BulkAccessOutcome,
  BulkAccessRequest,
} from "@/lib/platform/contracts";

/** Snapshot IDs, never a live filter. A retry must reuse these exact requests. */
export function freezeAccessRequests(
  ids: Iterable<string>,
  action: AccessAction,
  nextId: () => string = () => crypto.randomUUID()
): BulkAccessRequest[] {
  const frozen = [...new Set(ids)].sort();
  return Array.from({ length: Math.ceil(frozen.length / 100) }, (_, index) => ({
    requestId: nextId(),
    action,
    signupIds: frozen.slice(index * 100, (index + 1) * 100),
  }));
}

export function toggleSelection(
  selected: ReadonlySet<string>,
  ids: string[],
  checked: boolean
) {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Missing or malformed server outcomes are retryable failures, not successes. */
export function normalizeOutcomes(
  request: BulkAccessRequest,
  value: unknown
): BulkAccessOutcome[] {
  const body = value as { requestId?: unknown; outcomes?: unknown } | null;
  const outcomes =
    body?.requestId === request.requestId && Array.isArray(body.outcomes)
      ? (body.outcomes as BulkAccessOutcome[])
      : [];
  return request.signupIds.map((signupId) => {
    const matches = outcomes.filter(
      (item) => item && item.signupId === signupId
    );
    const outcome = matches[0];
    return matches.length === 1 &&
      ["approved", "revoked", "unchanged", "ineligible", "failed"].includes(
        outcome?.outcome
      )
      ? {
          signupId,
          outcome: outcome.outcome,
          ...(typeof outcome.code === "string" ? { code: outcome.code } : {}),
        }
      : { signupId, outcome: "failed", code: "invalid_response" };
  });
}

export function retryableRequests(
  requests: BulkAccessRequest[],
  outcomes: BulkAccessOutcome[]
) {
  const results = new Map(
    outcomes.map((item) => [item.signupId, item.outcome])
  );
  // Never shrink a chunk: the server binds its idempotency key to its full payload.
  return requests.filter((request) =>
    request.signupIds.some(
      (id) => !results.has(id) || results.get(id) === "failed"
    )
  );
}
