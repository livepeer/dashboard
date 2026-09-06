import { createHash } from "node:crypto";
import { z } from "zod";

export const scopeSchema = z
  .object({
    service: z.literal("pymthouse"),
    issuer: z.string().url(),
    appId: z.string().min(1),
  })
  .strict();
export const inventorySchema = z.object({
  users: z.array(
    z.object({
      id: z.string().min(1),
      clientId: z.string().min(1),
      externalUserId: z.string().min(1),
      email: z.string().nullable(),
      status: z.string(),
      role: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
});
export const evidenceSchema = z.array(
  z
    .object({
      subject: z.string().min(1),
      issuer: z.string().url(),
      source: z.enum(["console_authentication", "audited_console_identity"]),
      occurredAt: z.string().datetime(),
    })
    .strict()
);
export const manifestInputSchema = z
  .object({
    scope: scopeSchema,
    auth0Issuer: z.string().url(),
    cutoff: z.string().datetime(),
    inventory: inventorySchema,
    evidence: evidenceSchema,
  })
  .strict();

export function normalizeIssuer(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Issuer must not contain credentials, query, or fragment");
  return url.toString().replace(/\/+$/, "");
}

export function legacyExternalId(subject: string): string {
  return `eu_${createHash("sha256").update(`livepeer-console:externalUserId:${subject.trim()}`).digest("hex")}`;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildGrandfatherManifest(rawInput: unknown) {
  const input = manifestInputSchema.parse(rawInput);
  const issuer = normalizeIssuer(input.auth0Issuer);
  const scope = { ...input.scope, issuer: normalizeIssuer(input.scope.issuer) };
  const cutoff = new Date(input.cutoff).getTime();
  const evidence = input.evidence.filter(
    (row) =>
      normalizeIssuer(row.issuer) === issuer &&
      new Date(row.occurredAt).getTime() <= cutoff
  );
  const byExternal = new Map<string, Set<string>>();
  for (const row of evidence) {
    const externalId = legacyExternalId(row.subject);
    const subjects = byExternal.get(externalId) ?? new Set<string>();
    subjects.add(row.subject.trim());
    byExternal.set(externalId, subjects);
  }
  const duplicateIds = new Set<string>();
  const seen = new Set<string>();
  for (const row of input.inventory.users) {
    if (seen.has(row.externalUserId)) duplicateIds.add(row.externalUserId);
    seen.add(row.externalUserId);
  }
  const entries: Array<{
    authority: "auth0";
    issuer: string;
    subject: string;
    externalUserId: string;
    inventoryId: string;
  }> = [];
  const unresolved: Array<{ inventoryId: string; reason: string }> = [];
  let excludedAfterCutoff = 0;
  for (const row of input.inventory.users) {
    if (row.clientId !== scope.appId) {
      unresolved.push({ inventoryId: row.id, reason: "wrong_app_scope" });
      continue;
    }
    if (new Date(row.createdAt).getTime() > cutoff) {
      excludedAfterCutoff++;
      continue;
    }
    const subjects = [...(byExternal.get(row.externalUserId) ?? [])];
    const reason = duplicateIds.has(row.externalUserId)
      ? "duplicate_external_account"
      : row.status !== "active"
        ? "nonactive_account_requires_review"
        : subjects.length !== 1
          ? "missing_or_ambiguous_identity_evidence"
          : null;
    if (reason) {
      unresolved.push({ inventoryId: row.id, reason });
      continue;
    }
    entries.push({
      authority: "auth0",
      issuer,
      subject: subjects[0],
      externalUserId: row.externalUserId,
      inventoryId: row.id,
    });
  }
  entries.sort((a, b) => a.externalUserId.localeCompare(b.externalUserId));
  unresolved.sort((a, b) => a.inventoryId.localeCompare(b.inventoryId));
  const provenance = {
    inventoryChecksum: checksum(input.inventory),
    evidenceChecksum: checksum(input.evidence),
    cutoff: input.cutoff,
    scope,
    auth0Issuer: issuer,
  };
  return {
    version: 1 as const,
    provenance,
    entries,
    unresolved,
    excludedAfterCutoff,
    manifestChecksum: checksum({
      provenance,
      entries,
      unresolved,
      excludedAfterCutoff,
    }),
  };
}

export type GrandfatherManifest = ReturnType<typeof buildGrandfatherManifest>;

export function manifestSummary(manifest: GrandfatherManifest) {
  const reasons: Record<string, number> = {};
  for (const row of manifest.unresolved)
    reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  return {
    mode: "dry-run",
    ready: manifest.unresolved.length === 0,
    resolvedAccounts: manifest.entries.length,
    unresolvedAccounts: manifest.unresolved.length,
    excludedAfterCutoff: manifest.excludedAfterCutoff,
    reasons,
    manifestChecksum: manifest.manifestChecksum,
    inventoryChecksum: manifest.provenance.inventoryChecksum,
    evidenceChecksum: manifest.provenance.evidenceChecksum,
  };
}
