import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  adminRoleGrants,
  userEmails,
  users,
  waitlistSignups,
} from "@/lib/db/schema";
import type { AdminPrincipal } from "@/lib/platform/contracts";

type PermissionReader = Pick<ReturnType<typeof getDb>, "select">;
/** Database permission only. Provider claims, emails and cookies cannot grant roles. */
export async function getAdminPrincipalForUser(
  userId: string,
  db: PermissionReader = getDb()
): Promise<AdminPrincipal | null> {
  const [row] = await db
    .select({
      adminGrantId: adminRoleGrants.id,
      signupId: waitlistSignups.id,
      userId: users.id,
    })
    .from(users)
    .innerJoin(waitlistSignups, eq(waitlistSignups.userId, users.id))
    .innerJoin(
      userEmails,
      and(
        eq(userEmails.userId, users.id),
        eq(userEmails.normalizedEmail, waitlistSignups.normalizedEmail),
        isNotNull(userEmails.verifiedAt)
      )
    )
    .innerJoin(
      adminRoleGrants,
      eq(adminRoleGrants.signupId, waitlistSignups.id)
    )
    .where(
      and(
        eq(users.id, userId),
        eq(users.status, "active"),
        eq(waitlistSignups.status, "confirmed"),
        isNotNull(waitlistSignups.confirmedAt),
        eq(adminRoleGrants.role, "admin"),
        isNull(adminRoleGrants.revokedAt),
        sql`not exists (select 1 from access_grants revoked where revoked.status = 'revoked' and (revoked.user_id = ${users.id} or revoked.signup_id = ${waitlistSignups.id}))`
      )
    )
    .limit(1);
  return row ?? null;
}
