import "server-only";

import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  accessGrants,
  adminRoleGrants,
  userEmails,
  users,
  waitlistSignups,
} from "@/lib/db/schema";
import type {
  AdminPrincipal,
  AdminTeamList,
  AdminTeamMember,
} from "@/lib/platform/contracts";
import { normalizeEmail } from "@/lib/waitlist/security";
import { getAdminPrincipalForUser } from "./permissions";

export const addAdminSchema = z
  .object({ email: z.string().trim().email().max(320) })
  .strict();

export const revokeAdminSchema = z
  .object({ grantId: z.string().uuid() })
  .strict();

export class AdminTeamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = "AdminTeamError";
  }
}

type TeamDb = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function requireActiveActor(actor: AdminPrincipal, db: TeamDb) {
  const [row] = await db
    .select({ userId: waitlistSignups.userId })
    .from(adminRoleGrants)
    .innerJoin(
      waitlistSignups,
      eq(waitlistSignups.id, adminRoleGrants.signupId)
    )
    .where(
      and(
        eq(adminRoleGrants.id, actor.adminGrantId),
        eq(adminRoleGrants.signupId, actor.signupId),
        isNull(adminRoleGrants.revokedAt)
      )
    )
    .limit(1);
  if (!row?.userId) throw new AdminTeamError(403, "admin_required");
  const principal = await getAdminPrincipalForUser(row.userId, db);
  if (
    !principal ||
    principal.adminGrantId !== actor.adminGrantId ||
    principal.signupId !== actor.signupId
  )
    throw new AdminTeamError(403, "admin_required");
}

function member(
  row: {
    grantId: string;
    signupId: string;
    email: string;
    grantedAt: Date;
  },
  actor: AdminPrincipal
): AdminTeamMember {
  return {
    ...row,
    grantedAt: row.grantedAt.toISOString(),
    isCurrentUser: row.grantId === actor.adminGrantId,
  };
}

export async function listAdminTeam(
  actor: AdminPrincipal
): Promise<AdminTeamList> {
  const rows = await getDb()
    .select({
      grantId: adminRoleGrants.id,
      signupId: waitlistSignups.id,
      email: waitlistSignups.email,
      grantedAt: adminRoleGrants.grantedAt,
    })
    .from(adminRoleGrants)
    .innerJoin(
      waitlistSignups,
      eq(waitlistSignups.id, adminRoleGrants.signupId)
    )
    .innerJoin(users, eq(users.id, waitlistSignups.userId))
    .innerJoin(
      userEmails,
      and(
        eq(userEmails.userId, users.id),
        eq(userEmails.normalizedEmail, waitlistSignups.normalizedEmail),
        isNotNull(userEmails.verifiedAt)
      )
    )
    .where(
      and(
        eq(adminRoleGrants.role, "admin"),
        isNull(adminRoleGrants.revokedAt),
        eq(waitlistSignups.status, "confirmed"),
        isNotNull(waitlistSignups.confirmedAt),
        eq(users.status, "active")
      )
    )
    .orderBy(asc(waitlistSignups.normalizedEmail));
  return { members: rows.map((row) => member(row, actor)) };
}

export async function addAdmin(
  actor: AdminPrincipal,
  input: z.infer<typeof addAdminSchema>
): Promise<{
  member: AdminTeamMember;
  outcome: "added" | "restored" | "unchanged";
}> {
  const parsed = addAdminSchema.safeParse(input);
  if (!parsed.success) throw new AdminTeamError(400, "invalid_admin_email");
  const normalizedEmail = normalizeEmail(parsed.data.email);

  return getDb().transaction(async (tx) => {
    await requireActiveActor(actor, tx);
    const [target] = await tx
      .select({
        signupId: waitlistSignups.id,
        userId: users.id,
        email: waitlistSignups.email,
      })
      .from(waitlistSignups)
      .innerJoin(users, eq(users.id, waitlistSignups.userId))
      .innerJoin(
        userEmails,
        and(
          eq(userEmails.userId, users.id),
          eq(userEmails.normalizedEmail, waitlistSignups.normalizedEmail),
          isNotNull(userEmails.verifiedAt)
        )
      )
      .where(
        and(
          eq(waitlistSignups.normalizedEmail, normalizedEmail),
          eq(waitlistSignups.status, "confirmed"),
          isNotNull(waitlistSignups.confirmedAt),
          eq(users.status, "active")
        )
      )
      .limit(1);
    if (!target) throw new AdminTeamError(409, "admin_account_not_eligible");

    const [revokedAccess] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.status, "revoked"),
          or(
            eq(accessGrants.signupId, target.signupId),
            eq(accessGrants.userId, target.userId)
          )
        )
      )
      .limit(1);
    if (revokedAccess) throw new AdminTeamError(409, "admin_access_revoked");

    const [existing] = await tx
      .select()
      .from(adminRoleGrants)
      .where(
        and(
          eq(adminRoleGrants.signupId, target.signupId),
          eq(adminRoleGrants.role, "admin")
        )
      )
      .limit(1)
      .for("update");
    const now = new Date();
    let grant = existing;
    let outcome: "added" | "restored" | "unchanged" = "unchanged";
    if (!grant) {
      [grant] = await tx
        .insert(adminRoleGrants)
        .values({ signupId: target.signupId, source: "admin_team" })
        .onConflictDoNothing()
        .returning();
      if (grant) outcome = "added";
      else
        [grant] = await tx
          .select()
          .from(adminRoleGrants)
          .where(
            and(
              eq(adminRoleGrants.signupId, target.signupId),
              eq(adminRoleGrants.role, "admin")
            )
          )
          .limit(1)
          .for("update");
    }
    if (!grant) throw new AdminTeamError(503, "admin_team_update_unavailable");
    if (grant.revokedAt) {
      [grant] = await tx
        .update(adminRoleGrants)
        .set({ revokedAt: null, source: "admin_team" })
        .where(eq(adminRoleGrants.id, grant.id))
        .returning();
      outcome = "restored";
    }

    return {
      member: member(
        {
          grantId: grant.id,
          signupId: target.signupId,
          email: target.email,
          grantedAt: grant.grantedAt ?? now,
        },
        actor
      ),
      outcome,
    };
  });
}

export async function revokeAdmin(actor: AdminPrincipal, grantId: string) {
  const parsed = revokeAdminSchema.safeParse({ grantId });
  if (!parsed.success) throw new AdminTeamError(400, "invalid_admin_grant");
  if (grantId === actor.adminGrantId)
    throw new AdminTeamError(409, "cannot_revoke_self");

  return getDb().transaction(async (tx) => {
    await requireActiveActor(actor, tx);
    const [grant] = await tx
      .select({ id: adminRoleGrants.id })
      .from(adminRoleGrants)
      .where(
        and(
          eq(adminRoleGrants.id, grantId),
          eq(adminRoleGrants.role, "admin"),
          isNull(adminRoleGrants.revokedAt)
        )
      )
      .limit(1);
    if (!grant) throw new AdminTeamError(404, "admin_member_not_found");
    await tx
      .update(adminRoleGrants)
      .set({ revokedAt: new Date() })
      .where(eq(adminRoleGrants.id, grant.id));
    return { grantId: grant.id, outcome: "revoked" as const };
  });
}
