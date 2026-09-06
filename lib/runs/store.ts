import "server-only";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  externalAccounts,
  mcpAssets,
  runEvents,
  runReadAudits,
  runReconciliationJobs,
  runs,
  userEmails,
} from "@/lib/db/schema";
import {
  configuredPymthouseScope,
  findExternalAccountOwner,
} from "@/lib/external-accounts/service";
import { getAdminPrincipalForUser } from "@/lib/admin/permissions";
import type { AdminPrincipal } from "@/lib/platform/contracts";
import type {
  CreateRunInput,
  ReconciliationJob,
  RunDetail,
  RunListQuery,
  RunOwner,
  RunPage,
  RunRecord,
  RunStatus,
  RunSummary,
  RunTransition,
  JsonValue,
} from "./types";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Database | Transaction;
const terminal = new Set<RunStatus>(["succeeded", "failed", "cancelled"]);
const iso = (value: Date | null) => value?.toISOString() ?? null;

export async function resolveRunOwner(principalId: string): Promise<RunOwner> {
  const account = await findExternalAccountOwner({
    ...configuredPymthouseScope(),
    externalUserId: principalId,
  });
  if (!account) throw new Error("run_owner_unresolved");
  return { principalId, userId: account.userId, externalAccountId: account.id };
}

function ownerWhere(owner: RunOwner): SQL {
  return and(
    eq(runs.principalId, owner.principalId),
    eq(runs.userId, owner.userId),
    eq(runs.externalAccountId, owner.externalAccountId)
  )!;
}

function record(
  row: typeof runs.$inferSelect,
  email: string | null = null
): RunRecord {
  return {
    ...row,
    email,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
  };
}

async function detail(
  db: Reader,
  row: typeof runs.$inferSelect
): Promise<RunDetail> {
  const [assets, events, emails] = await Promise.all([
    db
      .select()
      .from(mcpAssets)
      .where(eq(mcpAssets.runId, row.id))
      .orderBy(asc(mcpAssets.createdAt), asc(mcpAssets.id)),
    db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, row.id))
      .orderBy(asc(runEvents.createdAt), asc(runEvents.id)),
    db
      .select({ email: userEmails.email })
      .from(userEmails)
      .where(
        and(eq(userEmails.userId, row.userId), eq(userEmails.isPrimary, true))
      )
      .limit(1),
  ]);
  return {
    ...record(row, emails[0]?.email ?? null),
    assets: assets.map((asset) => ({
      id: asset.id,
      url: asset.url,
      mediaType: asset.mediaType,
      providerRequestId: asset.providerRequestId,
      availableUntil: iso(asset.availableUntil),
      expiresAt: iso(asset.expiresAt),
      unavailableAt: iso(asset.unavailableAt),
      hiddenAt: iso(asset.hiddenAt),
      createdAt: asset.createdAt.toISOString(),
    })),
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function createRun(
  owner: RunOwner,
  input: CreateRunInput
): Promise<RunDetail> {
  return getDb().transaction(async (tx) => {
    // Independently enforce the authenticated binding even when a caller constructs an owner object.
    const scope = configuredPymthouseScope();
    const [account] = await tx
      .select({ id: externalAccounts.id })
      .from(externalAccounts)
      .where(
        and(
          eq(externalAccounts.id, owner.externalAccountId),
          eq(externalAccounts.userId, owner.userId),
          eq(externalAccounts.externalUserId, owner.principalId),
          eq(externalAccounts.service, scope.service),
          eq(externalAccounts.issuer, scope.issuer),
          eq(externalAccounts.appId, scope.appId)
        )
      );
    if (!account) throw new Error("run_owner_unresolved");
    const [row] = await tx
      .insert(runs)
      .values({
        ...owner,
        ...input,
        id: input.id ?? randomUUID(),
        source: "mcp",
        status: "queued",
      })
      .returning();
    await tx
      .insert(runEvents)
      .values({ runId: row.id, eventKey: "created", status: "queued" });
    return detail(tx, row);
  });
}

export async function transitionRun(
  owner: RunOwner,
  id: string,
  change: RunTransition
): Promise<RunDetail> {
  if (!change.eventKey.trim()) throw new Error("invalid_run_event_key");
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(runs)
      .where(and(ownerWhere(owner), eq(runs.id, id)))
      .for("update");
    if (!current) throw new Error("run_not_found");
    if (change.reconciliationLease) {
      const [lease] = await tx
        .select()
        .from(runReconciliationJobs)
        .where(
          and(
            eq(runReconciliationJobs.id, change.reconciliationLease.jobId),
            eq(runReconciliationJobs.runId, id)
          )
        )
        .for("update");
      if (
        !lease ||
        lease.leaseToken !== change.reconciliationLease.leaseToken ||
        !lease.leasedUntil ||
        lease.leasedUntil <= new Date() ||
        lease.completedAt
      )
        throw new Error("run_reconciliation_lease_lost");
    }
    const [existing] = await tx
      .select({ id: runEvents.id })
      .from(runEvents)
      .where(
        and(eq(runEvents.runId, id), eq(runEvents.eventKey, change.eventKey))
      );
    if (existing || terminal.has(current.status)) return detail(tx, current);
    if (
      change.expectedVersion !== undefined &&
      current.version !== change.expectedVersion
    )
      throw new Error("run_version_conflict");
    if (change.status === "queued" && current.status !== "queued")
      throw new Error("invalid_run_transition");
    const now = new Date();
    const [row] = await tx
      .update(runs)
      .set({
        status: change.status,
        provider: change.provider ?? current.provider,
        providerRequestId:
          change.providerRequestId ?? current.providerRequestId,
        result: change.result ?? current.result,
        errorCode:
          change.errorCode === undefined ? current.errorCode : change.errorCode,
        errorMessage:
          change.errorMessage === undefined
            ? current.errorMessage
            : change.errorMessage,
        startedAt:
          current.startedAt ?? (change.status === "running" ? now : null),
        completedAt: terminal.has(change.status) ? now : null,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(runs.id, id))
      .returning();
    if (change.assets?.length) {
      for (const asset of change.assets) {
        const url = new URL(asset.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error("invalid_run_asset_url");
        await tx
          .insert(mcpAssets)
          .values({
            id: asset.id ?? randomUUID(),
            runId: id,
            principalId: owner.principalId,
            gatewayRequestId: current.gatewayRequestId,
            capability: current.capability,
            providerRequestId:
              asset.providerRequestId ?? change.providerRequestId ?? null,
            url: asset.url,
            mediaType: asset.mediaType ?? null,
            availableUntil: asset.availableUntil
              ? new Date(asset.availableUntil)
              : null,
            expiresAt: asset.expiresAt ? new Date(asset.expiresAt) : null,
          })
          .onConflictDoNothing({
            target: [
              mcpAssets.principalId,
              mcpAssets.gatewayRequestId,
              mcpAssets.url,
            ],
          });
      }
    }
    await tx.insert(runEvents).values({
      runId: id,
      eventKey: change.eventKey,
      status: change.status,
      metadata: change.metadata ?? {},
    });
    if (
      change.queue &&
      !change.stopReconciliation &&
      !terminal.has(change.status)
    ) {
      // Progress receipts are recovery breadcrumbs, not authority to race the live SDK.
      // The final dispatch receipt wakes recovery immediately; a crash falls back after 15m.
      const progressOnly = change.eventKey.startsWith("progress:");
      const availableAt = progressOnly
        ? new Date(current.createdAt.getTime() + 15 * 60_000)
        : now;
      await tx
        .insert(runReconciliationJobs)
        .values({
          runId: id,
          queue: change.queue,
          availableAt,
          deadlineAt: new Date(current.createdAt.getTime() + 86_400_000),
        })
        .onConflictDoUpdate({
          target: runReconciliationJobs.runId,
          set: {
            queue: change.queue,
            leaseToken: sql`case when ${runReconciliationJobs.queue} is distinct from excluded.queue then null else ${runReconciliationJobs.leaseToken} end`,
            leasedUntil: sql`case when ${runReconciliationJobs.queue} is distinct from excluded.queue then null else ${runReconciliationJobs.leasedUntil} end`,
            completedAt: sql`case when ${runReconciliationJobs.queue} is distinct from excluded.queue then null else ${runReconciliationJobs.completedAt} end`,
            availableAt,
            attempts: sql`case when ${runReconciliationJobs.queue} is distinct from excluded.queue then 0 else ${runReconciliationJobs.attempts} end`,
            lastReason: sql`case when ${runReconciliationJobs.queue} is distinct from excluded.queue then 'queue_handle_replaced' else ${runReconciliationJobs.lastReason} end`,
          },
          setWhere: sql`${runReconciliationJobs.queue} is distinct from excluded.queue or (${!progressOnly} and ${runReconciliationJobs.completedAt} is null)`,
        });
    }
    if (terminal.has(change.status) || change.stopReconciliation)
      await tx
        .update(runReconciliationJobs)
        .set({
          completedAt: now,
          leaseToken: null,
          leasedUntil: null,
          lastReason: change.stopReconciliation ?? "run_terminal",
        })
        .where(eq(runReconciliationJobs.runId, id));
    return detail(tx, row);
  });
}

export async function getOwnRun(
  owner: RunOwner,
  id: string
): Promise<RunDetail | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(runs)
    .where(and(ownerWhere(owner), eq(runs.id, id)));
  return row ? detail(db, row) : null;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.createdAt !== "string"
    )
      throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || cursor.length > 1024)
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new Error("invalid_run_cursor");
  }
}

async function list(
  db: Reader,
  where: SQL | undefined,
  query: RunListQuery
): Promise<RunPage> {
  const base = [where];
  if (query.search?.trim()) {
    const pattern = `%${query.search.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    base.push(
      sql`(${userEmails.email} ilike ${pattern} escape '\\' or ${runs.capability} ilike ${pattern} escape '\\' or ${runs.gatewayRequestId} ilike ${pattern} escape '\\')`
    );
  }
  const filters = [...base];
  if (query.status) filters.push(eq(runs.status, query.status));
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    filters.push(
      or(
        lt(runs.createdAt, cursor.createdAt),
        and(eq(runs.createdAt, cursor.createdAt), lt(runs.id, cursor.id))
      )
    );
  }
  const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 25) || 25));
  const rows = await db
    .select({ row: runs, email: userEmails.email })
    .from(runs)
    .leftJoin(
      userEmails,
      and(eq(userEmails.userId, runs.userId), eq(userEmails.isPrimary, true))
    )
    .where(and(...filters))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(limit + 1);
  const grouped = await db
    .select({ status: runs.status, count: sql<number>`count(*)::int` })
    .from(runs)
    .leftJoin(
      userEmails,
      and(eq(userEmails.userId, runs.userId), eq(userEmails.isPrimary, true))
    )
    .where(and(...base))
    .groupBy(runs.status);
  const counts: RunPage["counts"] = {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
  };
  for (const group of grouped) {
    counts[group.status] = group.count;
    counts.total += group.count;
  }
  const items: RunSummary[] = rows.slice(0, limit).map(({ row, email }) => {
    const full = record(row, email);
    const {
      submittedArguments: _args,
      result: _result,
      captureRedactedPaths: _paths,
      ...summary
    } = full;
    void _args;
    void _result;
    void _paths;
    return summary;
  });
  const last = items.at(-1);
  return {
    items,
    counts,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt, id: last.id })
          ).toString("base64url")
        : null,
  };
}

export function listOwnRuns(
  owner: RunOwner,
  query: RunListQuery = {}
): Promise<RunPage> {
  return list(getDb(), ownerWhere(owner), query);
}

async function validateAdmin(actor: AdminPrincipal): Promise<string> {
  if (!actor.userId) throw new Error("run_admin_required");
  const active = await getAdminPrincipalForUser(actor.userId);
  if (
    !active ||
    active.adminGrantId !== actor.adminGrantId ||
    active.signupId !== actor.signupId
  )
    throw new Error("run_admin_required");
  return actor.userId;
}

export async function listAdminRuns(
  actor: AdminPrincipal,
  query: RunListQuery = {}
): Promise<RunPage> {
  const actorUserId = await validateAdmin(actor);
  return getDb().transaction(async (tx) => {
    const result = await list(tx, undefined, query);
    await tx.insert(runReadAudits).values({
      actorUserId,
      adminGrantId: actor.adminGrantId,
      action: "list",
      resultCount: result.items.length,
    });
    return result;
  });
}

export async function getAdminRun(
  actor: AdminPrincipal,
  id: string
): Promise<RunDetail | null> {
  const actorUserId = await validateAdmin(actor);
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(runs).where(eq(runs.id, id));
    if (!row) {
      await tx.insert(runReadAudits).values({
        actorUserId,
        adminGrantId: actor.adminGrantId,
        action: "detail",
        resultCount: 0,
      });
      return null;
    }
    const result = await detail(tx, row);
    await tx.insert(runReadAudits).values({
      actorUserId,
      adminGrantId: actor.adminGrantId,
      action: "detail",
      runId: id,
      resultCount: 1,
    });
    return result;
  });
}

export async function existingRunGatewayIds(
  owner: RunOwner,
  ids: string[]
): Promise<string[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const found: string[] = [];
  for (let start = 0; start < unique.length; start += 100) {
    const rows = await getDb()
      .select({ id: runs.gatewayRequestId })
      .from(runs)
      .where(
        and(
          ownerWhere(owner),
          inArray(runs.gatewayRequestId, unique.slice(start, start + 100))
        )
      );
    found.push(...rows.map((row) => row.id));
  }
  return found;
}

/** Correlate authenticated upstream billing evidence; never reinterpret it as execution success. */
export async function recordRunUsage(
  owner: RunOwner,
  tickets: {
    eventId: string;
    gatewayRequestId: string;
    metadata: Record<string, JsonValue>;
  }[]
): Promise<void> {
  await getDb().transaction(async (tx) => {
    for (const ticket of [...tickets].sort(
      (a, b) =>
        a.gatewayRequestId.localeCompare(b.gatewayRequestId) ||
        a.eventId.localeCompare(b.eventId)
    )) {
      if (!ticket.eventId || !ticket.gatewayRequestId) continue;
      const [run] = await tx
        .select({ id: runs.id, status: runs.status })
        .from(runs)
        .where(
          and(
            ownerWhere(owner),
            eq(runs.gatewayRequestId, ticket.gatewayRequestId)
          )
        )
        .for("update");
      if (!run) continue;
      await tx
        .insert(runEvents)
        .values({
          runId: run.id,
          eventKey: `usage:${ticket.eventId}`,
          status: run.status,
          metadata: {
            ...ticket.metadata,
            kind: "billing_usage",
            eventId: ticket.eventId,
          },
        })
        .onConflictDoNothing({ target: [runEvents.runId, runEvents.eventKey] });
    }
  });
}

export async function claimReconciliationJobs(
  limit = 10
): Promise<ReconciliationJob[]> {
  return getDb().transaction(async (tx) => {
    const now = new Date();
    const batchLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 10));
    // Execution's 13-minute timeout has elapsed, plus a two-minute observation margin.
    // A missing callback/receipt is absence of evidence, never evidence of failure.
    const stale = await tx
      .select()
      .from(runs)
      .where(
        and(
          inArray(runs.status, ["queued", "running"]),
          lt(runs.updatedAt, new Date(now.getTime() - 15 * 60_000))
        )
      )
      .orderBy(asc(runs.gatewayRequestId))
      .limit(batchLimit)
      .for("update", { skipLocked: true });
    for (const run of stale) {
      const [job] = await tx
        .select({ id: runReconciliationJobs.id })
        .from(runReconciliationJobs)
        .where(eq(runReconciliationJobs.runId, run.id));
      await tx
        .update(runs)
        .set({
          status: "unknown",
          errorCode: "observation_interrupted",
          errorMessage: job
            ? "Execution observation was interrupted; provider recovery is pending."
            : "Execution observation was interrupted and no recoverable provider receipt was captured.",
          updatedAt: now,
          version: run.version + 1,
        })
        .where(eq(runs.id, run.id));
      await tx.insert(runEvents).values({
        runId: run.id,
        eventKey: `observation_interrupted:${run.version}`,
        status: "unknown",
        metadata: {
          reason: job ? "observation_interrupted" : "queue_receipt_unavailable",
        },
      });
    }
    // Lock runs before jobs, matching completion's lock order, to avoid deadlocks.
    const pending = await tx
      .select({ job: runReconciliationJobs, run: runs })
      .from(runReconciliationJobs)
      .innerJoin(runs, eq(runs.id, runReconciliationJobs.runId))
      .where(
        and(
          isNull(runReconciliationJobs.completedAt),
          lt(runReconciliationJobs.availableAt, now),
          or(
            isNull(runReconciliationJobs.leasedUntil),
            lt(runReconciliationJobs.leasedUntil, now)
          )
        )
      )
      .orderBy(asc(runReconciliationJobs.availableAt))
      .limit(batchLimit)
      .for("update", { of: runs, skipLocked: true });
    const claimed: ReconciliationJob[] = [];
    for (const { job, run } of pending) {
      if (terminal.has(run.status) || job.deadlineAt <= now) {
        await tx
          .update(runReconciliationJobs)
          .set({
            completedAt: now,
            lastReason: terminal.has(run.status)
              ? "run_terminal"
              : "recovery_horizon_exceeded",
          })
          .where(eq(runReconciliationJobs.id, job.id));
        if (!terminal.has(run.status)) {
          await tx
            .update(runs)
            .set({
              status: "unknown",
              errorCode: "recovery_horizon_exceeded",
              updatedAt: now,
              version: run.version + 1,
            })
            .where(eq(runs.id, run.id));
          await tx
            .insert(runEvents)
            .values({
              runId: run.id,
              eventKey: "recovery_horizon_exceeded",
              status: "unknown",
            })
            .onConflictDoNothing();
        }
        continue;
      }
      const leaseToken = randomUUID();
      await tx
        .update(runReconciliationJobs)
        .set({
          leaseToken,
          leasedUntil: new Date(now.getTime() + 60_000),
          attempts: job.attempts + 1,
        })
        .where(eq(runReconciliationJobs.id, job.id));
      claimed.push({
        id: job.id,
        runId: job.runId,
        owner: {
          principalId: run.principalId,
          userId: run.userId,
          externalAccountId: run.externalAccountId,
        },
        leaseToken,
        attempts: job.attempts + 1,
        deadlineAt: job.deadlineAt.toISOString(),
        queue: job.queue,
      });
    }
    return claimed;
  });
}

export async function releaseReconciliationJob(
  job: ReconciliationJob,
  update: { done: boolean; reason?: string; retryAfterSeconds?: number }
): Promise<void> {
  const delay = Math.max(
    5,
    Math.min(
      3600,
      update.retryAfterSeconds ??
        Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8))
    )
  );
  await getDb()
    .update(runReconciliationJobs)
    .set({
      completedAt: update.done ? new Date() : null,
      lastReason: update.reason ?? null,
      availableAt: new Date(Date.now() + delay * 1000),
      leaseToken: null,
      leasedUntil: null,
    })
    .where(
      and(
        eq(runReconciliationJobs.id, job.id),
        eq(runReconciliationJobs.leaseToken, job.leaseToken)
      )
    );
}
