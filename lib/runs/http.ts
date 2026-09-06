import "server-only";
import { requireConsoleSession } from "@/lib/console/session-user";
import { resolveRunOwner } from "./store";
import type { RunListQuery, RunStatus } from "./types";

export const RUN_HEADERS = { "cache-control": "no-store" };
const statuses: RunStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
];
export function parseRunQuery(url: string): RunListQuery {
  const params = new URL(url).searchParams;
  const limit = Number(params.get("limit") ?? "50");
  const status = params.get("status");
  const cursor = params.get("cursor") || undefined;
  const search = params.get("search")?.trim() || undefined;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (status && !statuses.includes(status as RunStatus)) ||
    (cursor?.length ?? 0) > 2048 ||
    (search?.length ?? 0) > 320
  )
    throw new Error("invalid_run_query");
  return {
    limit,
    cursor,
    search,
    ...(status ? { status: status as RunStatus } : {}),
  };
}
export async function requireRunOwner() {
  const session = await requireConsoleSession();
  const owner = await resolveRunOwner(session.externalUserId);
  if (owner.userId !== session.canonicalUserId)
    throw new Error("run_owner_mismatch");
  return owner;
}
export function runError(error: unknown) {
  const e = error as { message?: string; code?: string; status?: number };
  const known = e?.message;
  const status =
    known === "run_not_found"
      ? 404
      : ["invalid_run_query", "invalid_run_cursor"].includes(known ?? "")
        ? 400
        : ["run_owner_mismatch", "run_admin_required"].includes(known ?? "")
          ? 403
          : [401, 403].includes(e?.status ?? 0)
            ? e.status!
            : 503;
  return Response.json(
    {
      error:
        status === 404
          ? "run_not_found"
          : status === 400
            ? "invalid_run_query"
            : status === 401
              ? "unauthorized"
              : status === 403
                ? "access_denied"
                : "history_unavailable",
    },
    { status, headers: RUN_HEADERS }
  );
}
