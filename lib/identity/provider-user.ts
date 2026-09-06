import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  authIdentities,
  externalAccounts,
  identityExternalAccounts,
  userEmails,
  users,
} from "@/lib/db/schema";
import { validateProviderIdentity } from "@/lib/authentication/identity";
import type {
  CanonicalIdentity,
  ProviderIdentity,
} from "@/lib/platform/contracts";
import { normalizeIdentityEmail } from "./canonical-user-policy";

export class IdentityResolutionError extends Error {
  readonly status = 503;
  constructor(readonly code: string) {
    super(code);
    this.name = "IdentityResolutionError";
  }
}

export type TrustedIdentityLink = {
  userId: string;
  existingIdentityId: string;
  /** Private migration/review evidence identifier, not an email-match assertion. */
  evidenceReference: string;
};

type Resolution = CanonicalIdentity & { identityCreated: boolean };

export function resolveProviderIdentity(
  input: ProviderIdentity
): Promise<Resolution> {
  return resolve(input);
}

/** Coordinator-run migration only. No route may expose this linking primitive. */
export function linkProviderIdentityToUser(
  input: ProviderIdentity,
  proof: TrustedIdentityLink
): Promise<Resolution> {
  if (
    !proof.evidenceReference.trim() ||
    !proof.userId ||
    !proof.existingIdentityId
  ) {
    throw new IdentityResolutionError("identity_link_proof_required");
  }
  return resolve(input, proof);
}

async function resolve(
  raw: ProviderIdentity,
  proof?: TrustedIdentityLink
): Promise<Resolution> {
  const input = validateProviderIdentity(raw);
  const email = input.email?.trim();
  const normalizedEmail = normalizeIdentityEmail(email);
  const verified = !!normalizedEmail && input.emailVerified;
  const now = new Date();
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`identity:${input.authority}:${input.issuer}:${input.subject}`}, 0))`
    );
    if (verified)
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`email:${normalizedEmail}`}, 0))`
      );
    const [existing] = await tx
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.authority, input.authority),
          eq(authIdentities.issuer, input.issuer),
          eq(authIdentities.providerSubject, input.subject)
        )
      )
      .limit(1);

    if (!existing) {
      const [legacy] = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.authority, input.authority),
            eq(authIdentities.providerSubject, input.subject),
            isNull(authIdentities.issuer)
          )
        )
        .limit(1);
      if (legacy)
        throw new IdentityResolutionError("identity_legacy_issuer_unresolved");
    }

    let userId = existing?.userId;
    if (proof) {
      const [source] = await tx
        .select()
        .from(authIdentities)
        .where(eq(authIdentities.id, proof.existingIdentityId))
        .limit(1);
      if (
        !source?.issuer ||
        source.userId !== proof.userId ||
        (userId && userId !== proof.userId)
      ) {
        throw new IdentityResolutionError("identity_link_conflict");
      }
      userId = proof.userId;
    }

    if (!userId) {
      // Email is contact data, not permission to merge independent identities.
      const [created] = await tx
        .insert(users)
        .values({ lastSeenAt: now, updatedAt: now })
        .returning({ id: users.id });
      userId = created.id;
    }
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`user:${userId}`}, 0))`
    );
    const [user] = await tx
      .update(users)
      .set({ updatedAt: now, lastSeenAt: now })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new IdentityResolutionError("identity_user_unresolved");

    const metadata = {
      ...(existing?.providerMetadata ?? {}),
      authority: input.authority,
      strategy: input.strategy ?? input.authority,
    };
    const [identity] = existing
      ? await tx
          .update(authIdentities)
          .set({ lastSeenAt: now, providerMetadata: metadata })
          .where(eq(authIdentities.id, existing.id))
          .returning()
      : await tx
          .insert(authIdentities)
          .values({
            userId,
            authority: input.authority,
            issuer: input.issuer,
            provider: input.strategy ?? input.authority,
            providerSubject: input.subject,
            providerMetadata: metadata,
            lastSeenAt: now,
          })
          .returning();

    if (proof) {
      const sourceAccounts = await tx
        .select({
          accountId: externalAccounts.id,
          userId: externalAccounts.userId,
          externalUserId: externalAccounts.externalUserId,
          service: externalAccounts.service,
          issuer: externalAccounts.issuer,
          appId: externalAccounts.appId,
        })
        .from(identityExternalAccounts)
        .innerJoin(
          externalAccounts,
          eq(externalAccounts.id, identityExternalAccounts.externalAccountId)
        )
        .where(
          eq(identityExternalAccounts.identityId, proof.existingIdentityId)
        );
      if (sourceAccounts.some((account) => account.userId !== userId))
        throw new IdentityResolutionError("identity_link_account_conflict");
      const [source] = await tx
        .select({ externalUserId: authIdentities.externalUserId })
        .from(authIdentities)
        .where(eq(authIdentities.id, proof.existingIdentityId))
        .limit(1);
      if (
        source?.externalUserId &&
        !sourceAccounts.some(
          (account) => account.externalUserId === source.externalUserId
        )
      ) {
        throw new IdentityResolutionError(
          "identity_link_legacy_account_unresolved"
        );
      }
      const targetAccounts = await tx
        .select({
          accountId: externalAccounts.id,
          service: externalAccounts.service,
          issuer: externalAccounts.issuer,
          appId: externalAccounts.appId,
        })
        .from(identityExternalAccounts)
        .innerJoin(
          externalAccounts,
          eq(externalAccounts.id, identityExternalAccounts.externalAccountId)
        )
        .where(eq(identityExternalAccounts.identityId, identity.id));
      const scopes = new Map<string, string>();
      for (const account of [...targetAccounts, ...sourceAccounts]) {
        const scope = JSON.stringify([
          account.service,
          account.issuer,
          account.appId,
        ]);
        if (scopes.has(scope) && scopes.get(scope) !== account.accountId)
          throw new IdentityResolutionError("identity_link_account_conflict");
        scopes.set(scope, account.accountId);
      }
      for (const account of sourceAccounts) {
        await tx
          .insert(identityExternalAccounts)
          .values({
            identityId: identity.id,
            externalAccountId: account.accountId,
          })
          .onConflictDoNothing();
      }
      await tx
        .update(authIdentities)
        .set({
          providerMetadata: {
            ...metadata,
            linkEvidence: proof.evidenceReference,
            linkedFromIdentity: proof.existingIdentityId,
          },
        })
        .where(eq(authIdentities.id, identity.id));
    }

    const conflicts: string[] = [];
    if (email && normalizedEmail) {
      const [owner] = verified
        ? await tx
            .select({ userId: userEmails.userId })
            .from(userEmails)
            .where(
              and(
                eq(userEmails.normalizedEmail, normalizedEmail),
                isNotNull(userEmails.verifiedAt)
              )
            )
            .limit(1)
        : [];
      if (owner && owner.userId !== userId) {
        conflicts.push("verified_email");
      } else {
        await tx
          .update(userEmails)
          .set({ isPrimary: false, updatedAt: now })
          .where(eq(userEmails.userId, userId));
        await tx
          .insert(userEmails)
          .values({
            userId,
            email,
            normalizedEmail,
            source: input.authority,
            isPrimary: true,
            verifiedAt: verified ? now : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [userEmails.userId, userEmails.normalizedEmail],
            set: {
              email,
              source: input.authority,
              isPrimary: true,
              ...(verified ? { verifiedAt: now } : {}),
              updatedAt: now,
            },
          });
      }
    }
    return {
      userId,
      identityId: identity.id,
      accountStatus: user.status,
      identityCreated: !existing,
      ...(verified && !conflicts.length
        ? { verifiedEmail: normalizedEmail! }
        : {}),
      conflicts,
    };
  });
}
