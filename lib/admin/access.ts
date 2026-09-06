import "server-only";
import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  accessEvents,
  accessGrants,
  accessOperationItems,
  accessOperations,
  adminRoleGrants,
  emailOutbox,
  emailSubscriptions,
  users,
  waitlistSignups,
} from "@/lib/db/schema";
import type {
  AdminAccessList,
  AdminPrincipal,
  BulkAccessOutcome,
  BulkAccessRequest,
} from "@/lib/platform/contracts";
import { AccessError } from "@/lib/access/service";
import { APPROVAL_EMAIL_EVENT, dispatchOutboxEvent } from "@/lib/email/outbox";
import { getAdminPrincipalForUser } from "./permissions";

export const bulkAccessSchema = z
  .object({
    requestId: z.string().min(8).max(128),
    action: z.enum(["approve", "revoke"]),
    signupIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();
export class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}
export function canonicalBulkPayload(input: BulkAccessRequest) {
  const signupIds = [...new Set(input.signupIds)].sort();
  return {
    signupIds,
    hash: createHash("sha256")
      .update(JSON.stringify([input.action, signupIds]))
      .digest("hex"),
  };
}

export async function mutateAccessSelection(
  actor: AdminPrincipal,
  input: BulkAccessRequest
) {
  const parsed = bulkAccessSchema.safeParse(input);
  if (!parsed.success) throw new AdminRequestError(400, "invalid_selection");
  const { signupIds, hash } = canonicalBulkPayload(parsed.data);
  const operation = await getDb().transaction(async (tx) => {
    const [admin] = await tx
      .select()
      .from(adminRoleGrants)
      .where(
        and(
          eq(adminRoleGrants.id, actor.adminGrantId),
          eq(adminRoleGrants.signupId, actor.signupId),
          isNull(adminRoleGrants.revokedAt)
        )
      )
      .limit(1);
    if (!admin) throw new AccessError("pending", "admin_required");
    const [adminSignup] = await tx
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.id, admin.signupId))
      .limit(1);
    const [adminUser] = adminSignup.userId
      ? await tx
          .select()
          .from(users)
          .where(eq(users.id, adminSignup.userId))
          .limit(1)
      : [];
    if (adminSignup.status !== "confirmed" || adminUser?.status === "disabled")
      throw new AccessError("disabled", "admin_required");
    const principal = adminSignup.userId
      ? await getAdminPrincipalForUser(adminSignup.userId, tx)
      : null;
    if (
      !principal ||
      principal.adminGrantId !== actor.adminGrantId ||
      principal.signupId !== actor.signupId ||
      (actor.userId && principal.userId !== actor.userId)
    )
      throw new AccessError("pending", "admin_required");
    await tx
      .insert(accessOperations)
      .values({
        actorAdminGrantId: actor.adminGrantId,
        requestId: input.requestId,
        action: input.action,
        payloadHash: hash,
      })
      .onConflictDoNothing();
    const [op] = await tx
      .select()
      .from(accessOperations)
      .where(
        and(
          eq(accessOperations.actorAdminGrantId, actor.adminGrantId),
          eq(accessOperations.requestId, input.requestId)
        )
      )
      .limit(1);
    if (op.payloadHash !== hash || op.action !== input.action)
      throw new AdminRequestError(409, "idempotency_conflict");
    return op;
  });
  const outcomes: BulkAccessOutcome[] = [];
  for (const signupId of signupIds) {
    try {
      const outcome = await getDb().transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`operation:${operation.id}:${signupId}`}, 0))`
        );
        const [previous] = await tx
          .select()
          .from(accessOperationItems)
          .where(
            and(
              eq(accessOperationItems.operationId, operation.id),
              eq(accessOperationItems.signupId, signupId)
            )
          )
          .limit(1);
        if (previous && previous.outcome !== "failed")
          return {
            signupId,
            outcome: previous.outcome as BulkAccessOutcome["outcome"],
            ...(previous.code ? { code: previous.code } : {}),
          };
        const [snapshot] = await tx
          .select({ userId: waitlistSignups.userId })
          .from(waitlistSignups)
          .where(eq(waitlistSignups.id, signupId))
          .limit(1);
        if (!snapshot)
          return {
            signupId,
            outcome: "ineligible" as const,
            code: "signup_missing",
          };
        if (snapshot.userId)
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`user:${snapshot.userId}`}, 0))`
          );
        const [signup] = await tx
          .select()
          .from(waitlistSignups)
          .where(eq(waitlistSignups.id, signupId))
          .for("update")
          .limit(1);
        if (signup.userId !== snapshot.userId)
          throw new Error("concurrent_link_retry");
        // Recheck authority for each committed item, not only at batch entry.
        const [admin] = await tx
          .select()
          .from(adminRoleGrants)
          .where(
            and(
              eq(adminRoleGrants.id, actor.adminGrantId),
              isNull(adminRoleGrants.revokedAt)
            )
          )
          .for("share")
          .limit(1);
        if (!admin) throw new AccessError("pending", "admin_required");
        const [adminSignup] = await tx
          .select()
          .from(waitlistSignups)
          .where(eq(waitlistSignups.id, admin.signupId))
          .limit(1);
        const [adminUser] = adminSignup.userId
          ? await tx
              .select()
              .from(users)
              .where(eq(users.id, adminSignup.userId))
              .limit(1)
          : [];
        if (
          adminSignup.status !== "confirmed" ||
          adminUser?.status === "disabled"
        )
          throw new AccessError("disabled", "admin_required");
        const principal = adminSignup.userId
          ? await getAdminPrincipalForUser(adminSignup.userId, tx)
          : null;
        if (
          !principal ||
          principal.adminGrantId !== actor.adminGrantId ||
          principal.signupId !== actor.signupId ||
          (actor.userId && principal.userId !== actor.userId)
        )
          throw new AccessError("pending", "admin_required");
        const [user] = signup.userId
          ? await tx
              .select()
              .from(users)
              .where(eq(users.id, signup.userId))
              .limit(1)
          : [];
        let result: BulkAccessOutcome = {
          signupId,
          outcome: "ineligible",
          code: "verification_required",
        };
        let eventId: string | undefined;
        if (
          (signup.status === "confirmed" || signup.status === "invited") &&
          signup.confirmedAt &&
          (input.action === "revoke" || user?.status !== "disabled")
        ) {
          const grants = await tx
            .select()
            .from(accessGrants)
            .where(
              or(
                eq(accessGrants.signupId, signupId),
                ...(signup.userId
                  ? [eq(accessGrants.userId, signup.userId)]
                  : [])
              )
            )
            .for("update");
          let grant =
            grants.find((g) => g.signupId === signupId) ??
            grants.find((g) => g.userId === signup.userId);
          if (
            grants.length > 1 ||
            (grant?.userId && grant.userId !== signup.userId) ||
            (grant?.signupId && grant.signupId !== signupId)
          ) {
            result = {
              signupId,
              outcome: "ineligible",
              code: "grant_link_conflict",
            };
          } else if (
            grant?.status ===
            (input.action === "approve" ? "approved" : "revoked")
          ) {
            result = { signupId, outcome: "unchanged" };
          } else {
            const status =
              input.action === "approve"
                ? ("approved" as const)
                : ("revoked" as const);
            const previousStatus = grant?.status;
            const version = (grant?.version ?? 0) + 1;
            const now = new Date();
            const values = {
              signupId,
              userId: signup.userId,
              status,
              source: "admin_selection",
              version,
              updatedAt: now,
              ...(status === "approved"
                ? { approvedAt: now, revokedAt: null }
                : { revokedAt: now }),
            };
            [grant] = grant
              ? await tx
                  .update(accessGrants)
                  .set(values)
                  .where(eq(accessGrants.id, grant.id))
                  .returning()
              : await tx.insert(accessGrants).values(values).returning();
            const [event] = await tx
              .insert(accessEvents)
              .values({
                grantId: grant.id,
                actorAdminGrantId: actor.adminGrantId,
                operationId: operation.id,
                action: input.action,
                source: "admin_selection",
                previousStatus,
                nextStatus: status,
                grantVersion: version,
              })
              .returning({ id: accessEvents.id });
            eventId = event.id;
            if (status === "approved") {
              const site = process.env.NEXT_PUBLIC_SITE_URL;
              if (!site || !/^https?:\/\//.test(site))
                throw new Error("approval_origin_unconfigured");
              await tx
                .insert(emailOutbox)
                .values({
                  signupId,
                  eventType: APPROVAL_EMAIL_EVENT,
                  payload: {
                    to: signup.email,
                    loginUrl: new URL("/login", site).toString(),
                  },
                  idempotencyKey: `access-approved:${grant.id}:${version}`,
                })
                .onConflictDoNothing();
            }
            result = { signupId, outcome: status };
          }
        }
        await tx
          .insert(accessOperationItems)
          .values({
            operationId: operation.id,
            signupId,
            outcome: result.outcome,
            code: result.code,
            eventId,
          })
          .onConflictDoUpdate({
            target: [
              accessOperationItems.operationId,
              accessOperationItems.signupId,
            ],
            set: {
              outcome: result.outcome,
              code: result.code ?? null,
              eventId: eventId ?? null,
              updatedAt: new Date(),
            },
          });
        return result;
      });
      outcomes.push(outcome);
    } catch (error) {
      const code =
        error instanceof AccessError ? error.code : "item_retry_required";
      console.error("access_selection_item_failed", {
        operationId: operation.id,
        signupId,
        code,
      });
      // Persist a retryable failure when storage is available. Never replace a
      // completed result written by a concurrent retry of the same operation.
      try {
        await getDb().transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`operation:${operation.id}:${signupId}`}, 0))`
          );
          await tx
            .insert(accessOperationItems)
            .values({
              operationId: operation.id,
              signupId,
              outcome: "failed",
              code,
            })
            .onConflictDoUpdate({
              target: [
                accessOperationItems.operationId,
                accessOperationItems.signupId,
              ],
              set: { code, updatedAt: new Date() },
              setWhere: eq(accessOperationItems.outcome, "failed"),
            });
        });
      } catch {
        /* Unavailable storage is reported as a failed, safe-to-retry item. */
      }
      outcomes.push({ signupId, outcome: "failed", code });
    }
  }
  return { requestId: input.requestId, outcomes };
}

export function parseAccessFilters(params: URLSearchParams) {
  const state = params.get("state") ?? "waiting";
  if (
    ![
      "waiting",
      "approved",
      "revoked",
      "all",
      "unverified",
      "subscribed",
    ].includes(state)
  )
    throw new AdminRequestError(400, "invalid_state");
  const page = Number(params.get("page") ?? "1"),
    pageSize = Number(params.get("pageSize") ?? "50");
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new AdminRequestError(400, "invalid_page");
  return {
    state,
    page,
    pageSize,
    search: (params.get("search") ?? "").slice(0, 320),
  };
}
function filterWhere(filters: ReturnType<typeof parseAccessFilters>) {
  return and(
    // All entries retains unverified contacts; the dedicated debugging filter
    // narrows to them. Access-status filters retain verified contacts only.
    filters.state === "unverified"
      ? isNull(waitlistSignups.confirmedAt)
      : filters.state === "all" || filters.state === "subscribed"
        ? undefined
        : isNotNull(waitlistSignups.confirmedAt),
    filters.search
      ? ilike(
          waitlistSignups.email,
          `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`
        )
      : undefined,
    filters.state === "waiting"
      ? and(eq(waitlistSignups.status, "confirmed"), isNull(accessGrants.id))
      : filters.state === "subscribed"
        ? eq(emailSubscriptions.status, "subscribed")
        : filters.state === "all" || filters.state === "unverified"
          ? undefined
          : eq(accessGrants.status, filters.state as "approved" | "revoked")
  );
}
export async function listAccessEntries(
  filters: ReturnType<typeof parseAccessFilters>
): Promise<AdminAccessList> {
  const db = getDb();
  const [total] = await db
    .select({ value: count() })
    .from(waitlistSignups)
    .leftJoin(accessGrants, eq(accessGrants.signupId, waitlistSignups.id))
    .leftJoin(
      emailSubscriptions,
      and(
        eq(emailSubscriptions.normalizedEmail, waitlistSignups.normalizedEmail),
        eq(emailSubscriptions.purpose, "product_marketing")
      )
    )
    .where(filterWhere(filters));
  const rows = await db
    .select({
      signup: waitlistSignups,
      status: accessGrants.status,
      userStatus: users.status,
      subscriptionStatus: emailSubscriptions.status,
    })
    .from(waitlistSignups)
    .leftJoin(accessGrants, eq(accessGrants.signupId, waitlistSignups.id))
    .leftJoin(users, eq(users.id, waitlistSignups.userId))
    .leftJoin(
      emailSubscriptions,
      and(
        eq(emailSubscriptions.normalizedEmail, waitlistSignups.normalizedEmail),
        eq(emailSubscriptions.purpose, "product_marketing")
      )
    )
    .where(filterWhere(filters))
    .orderBy(
      asc(
        sql`case when ${waitlistSignups.confirmedAt} is null then 1 else 0 end`
      ),
      desc(waitlistSignups.firstSeenAt),
      asc(waitlistSignups.id)
    )
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
  return {
    rows: rows.map((row) => ({
      id: row.signup.id,
      email: row.signup.email,
      waitlistStatus: row.signup.status,
      accessState:
        row.userStatus === "disabled" ? "disabled" : (row.status ?? "pending"),
      joinedAt: row.signup.firstSeenAt.toISOString(),
      userId: row.signup.userId,
      newsletterSubscribed: row.subscriptionStatus === "subscribed",
    })),
    total: total.value,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
export async function freezeAccessSelection(
  filters: ReturnType<typeof parseAccessFilters>
) {
  const rows = await getDb()
    .select({ id: waitlistSignups.id })
    .from(waitlistSignups)
    .leftJoin(accessGrants, eq(accessGrants.signupId, waitlistSignups.id))
    .leftJoin(
      emailSubscriptions,
      and(
        eq(emailSubscriptions.normalizedEmail, waitlistSignups.normalizedEmail),
        eq(emailSubscriptions.purpose, "product_marketing")
      )
    )
    .where(filterWhere(filters))
    .orderBy(
      asc(
        sql`case when ${waitlistSignups.confirmedAt} is null then 1 else 0 end`
      ),
      desc(waitlistSignups.firstSeenAt),
      asc(waitlistSignups.id)
    );
  return { signupIds: rows.map((row) => row.id), total: rows.length };
}

export async function exportAccessSelection(signupIds: string[]) {
  const ids = [...new Set(signupIds)];
  if (!ids.length || ids.length > 500)
    throw new AdminRequestError(400, "invalid_selection");
  const rows = await getDb()
    .select({
      id: waitlistSignups.id,
      email: waitlistSignups.email,
      joinedAt: waitlistSignups.firstSeenAt,
    })
    .from(waitlistSignups)
    .where(inArray(waitlistSignups.id, ids));
  if (rows.length !== ids.length)
    throw new AdminRequestError(409, "selection_changed");
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => {
    const row = byId.get(id)!;
    return { email: row.email, joinedAt: row.joinedAt.toISOString() };
  });
}

/** Dispatch only this request's approval transitions, never the unrelated backlog. */
export async function dispatchSelectionInvitations(
  actor: AdminPrincipal,
  requestId: string
) {
  const rows = await getDb()
    .select({
      grantId: accessEvents.grantId,
      version: accessEvents.grantVersion,
    })
    .from(accessEvents)
    .innerJoin(
      accessOperations,
      eq(accessEvents.operationId, accessOperations.id)
    )
    .where(
      and(
        eq(accessOperations.actorAdminGrantId, actor.adminGrantId),
        eq(accessOperations.requestId, requestId),
        eq(accessEvents.action, "approve")
      )
    );
  for (const row of rows) {
    const [event] = await getDb()
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        eq(
          emailOutbox.idempotencyKey,
          `access-approved:${row.grantId}:${row.version}`
        )
      )
      .limit(1);
    if (event) await dispatchOutboxEvent(event.id);
  }
}
