import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  authIdentities,
  externalAccounts,
  identityExternalAccounts,
  users,
} from "@/lib/db/schema";
import type {
  ExternalAccountScope,
  ResolvedExternalAccount,
} from "@/lib/platform/contracts";
import {
  ExternalAccountError,
  normalizeAccountScope,
  selectExternalAccount,
} from "./policy";

export { ExternalAccountError } from "./policy";

export function configuredPymthouseScope(): ExternalAccountScope {
  const issuer = process.env.PYMTHOUSE_ISSUER_URL?.trim();
  const appId =
    process.env.PYMTHOUSE_PUBLIC_CLIENT_ID?.trim() ||
    process.env.DASHBOARD_DEVICE_PUBLIC_CLIENT_ID?.trim();
  if (!issuer || !appId)
    throw new ExternalAccountError("external_account_scope_unconfigured");
  return normalizeAccountScope({ service: "pymthouse", issuer, appId });
}

function scopeWhere(scope: ExternalAccountScope) {
  return and(
    eq(externalAccounts.service, scope.service),
    eq(externalAccounts.issuer, scope.issuer),
    eq(externalAccounts.appId, scope.appId)
  );
}

export async function resolveExternalAccount(
  input: ExternalAccountScope & { userId: string; identityId?: string }
): Promise<ResolvedExternalAccount> {
  const scope = normalizeAccountScope(input);
  return getDb().transaction(async (tx) => {
    // Shared by linking/backfill operations; serializes allocation for all identities of a user.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`user:${input.userId}`}, 0))`
    );
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user) throw new ExternalAccountError("external_account_user_unknown");
    const [identity] = input.identityId
      ? await tx
          .select()
          .from(authIdentities)
          .where(eq(authIdentities.id, input.identityId))
          .limit(1)
      : [];
    if (
      input.identityId &&
      (!identity || identity.userId !== input.userId || !identity.issuer)
    ) {
      throw new ExternalAccountError("external_account_identity_unresolved");
    }
    const accounts = await tx
      .select()
      .from(externalAccounts)
      .where(and(eq(externalAccounts.userId, input.userId), scopeWhere(scope)));
    const bindings = input.identityId
      ? await tx
          .select({ accountId: identityExternalAccounts.externalAccountId })
          .from(identityExternalAccounts)
          .where(eq(identityExternalAccounts.identityId, input.identityId))
      : [];
    // Broken cross-user bindings cannot be silently ignored as an unbound identity.
    if (bindings.length) {
      const owners = await tx
        .select({ userId: externalAccounts.userId })
        .from(externalAccounts)
        .innerJoin(
          identityExternalAccounts,
          eq(identityExternalAccounts.externalAccountId, externalAccounts.id)
        )
        .where(eq(identityExternalAccounts.identityId, input.identityId!));
      if (owners.some((owner) => owner.userId !== input.userId))
        throw new ExternalAccountError("external_account_binding_conflict");
    }
    let account = selectExternalAccount(
      accounts,
      bindings.map((binding) => binding.accountId)
    );
    if (
      identity?.externalUserId &&
      (!account || account.externalUserId !== identity.externalUserId)
    ) {
      // A legacy alias must have been explicitly backfilled in this scope first.
      throw new ExternalAccountError("external_account_legacy_unresolved");
    }
    if (!account) {
      const legacyIdentities = await tx
        .select({
          externalUserId: authIdentities.externalUserId,
          issuer: authIdentities.issuer,
        })
        .from(authIdentities)
        .where(eq(authIdentities.userId, input.userId));
      if (legacyIdentities.some((row) => row.externalUserId || !row.issuer)) {
        throw new ExternalAccountError("external_account_legacy_unresolved");
      }
      [account] = await tx
        .insert(externalAccounts)
        .values({
          userId: input.userId,
          ...scope,
          externalUserId: `eu_${randomUUID().replaceAll("-", "")}`,
          source: "canonical_user",
        })
        .returning();
    }
    if (input.identityId) {
      await tx
        .insert(identityExternalAccounts)
        .values({ identityId: input.identityId, externalAccountId: account.id })
        .onConflictDoNothing();
    }
    return {
      id: account.id,
      userId: account.userId,
      externalUserId: account.externalUserId,
    };
  });
}

/** Reverse lookup never enrolls, allocates, or assumes ownership from JWT email. */
export async function findExternalAccountOwner(
  input: ExternalAccountScope & { externalUserId: string }
): Promise<ResolvedExternalAccount | null> {
  const scope = normalizeAccountScope(input);
  if (!input.externalUserId.trim()) return null;
  const [account] = await getDb()
    .select({
      id: externalAccounts.id,
      userId: externalAccounts.userId,
      externalUserId: externalAccounts.externalUserId,
    })
    .from(externalAccounts)
    .where(
      and(
        scopeWhere(scope),
        eq(externalAccounts.externalUserId, input.externalUserId)
      )
    )
    .limit(1);
  return account ?? null;
}
