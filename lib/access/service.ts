import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accessGrants, users } from "@/lib/db/schema";
import { findExternalAccountOwner } from "@/lib/external-accounts/service";
import { getAdminPrincipalForUser } from "@/lib/admin/permissions";
import type {
  AccessDecision,
  AccessState,
  ExternalAccountScope,
} from "@/lib/platform/contracts";

export class AccessError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(
    readonly state: AccessState,
    code = `access_${state}`
  ) {
    super(code);
    this.name = "AccessError";
    this.status = state === "unavailable" ? 503 : 403;
    this.code = code;
  }
}

export async function getAccessDecision(
  userId: string
): Promise<AccessDecision> {
  try {
    const [row] = await getDb()
      .select({
        status: users.status,
        grantId: accessGrants.id,
        grantStatus: accessGrants.status,
        revokedGrantId: sql<
          string | null
        >`(select revoked.id from access_grants revoked where revoked.status = 'revoked' and (revoked.user_id = ${users.id} or revoked.signup_id in (select linked.id from waitlist_signups linked where linked.user_id = ${users.id})) limit 1)`,
      })
      .from(users)
      .leftJoin(accessGrants, eq(accessGrants.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return { state: "unavailable", userId };
    const revoked = !!row.revokedGrantId || row.grantStatus === "revoked";
    const admin =
      row.status !== "disabled" && !revoked
        ? await getAdminPrincipalForUser(userId)
        : null;
    return {
      state:
        row.status === "disabled"
          ? "disabled"
          : revoked
            ? "revoked"
            : admin
              ? "approved"
              : (row.grantStatus ?? "pending"),
      userId,
      ...(row.revokedGrantId || row.grantId
        ? { grantId: row.revokedGrantId ?? row.grantId! }
        : {}),
    };
  } catch (error) {
    console.error("access_decision_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return { state: "unavailable", userId };
  }
}

export async function requireApprovedUser(
  userId: string
): Promise<AccessDecision> {
  const decision = await getAccessDecision(userId);
  if (decision.state !== "approved") throw new AccessError(decision.state);
  return decision;
}

export async function requireApprovedExternalAccount(
  scope: ExternalAccountScope,
  externalUserId: string
): Promise<AccessDecision> {
  try {
    const account = await findExternalAccountOwner({
      ...scope,
      externalUserId,
    });
    if (!account) throw new AccessError("pending", "external_account_unknown");
    return await requireApprovedUser(account.userId);
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError("unavailable");
  }
}
