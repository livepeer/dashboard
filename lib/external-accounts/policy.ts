import { normalizeIssuer } from "@/lib/authentication/identity";
import type { ExternalAccountScope } from "@/lib/platform/contracts";

export class ExternalAccountError extends Error {
  readonly status = 503;
  constructor(readonly code: string) {
    super(code);
    this.name = "ExternalAccountError";
  }
}

export function normalizeAccountScope(
  scope: ExternalAccountScope
): ExternalAccountScope {
  if (scope.service !== "pymthouse" || !scope.appId.trim()) {
    throw new ExternalAccountError("external_account_scope_invalid");
  }
  return {
    service: scope.service,
    issuer: normalizeIssuer(scope.issuer),
    appId: scope.appId.trim(),
  };
}

/** Never guess which historical billing account belongs to this session. */
export function selectExternalAccount<T extends { id: string }>(
  accounts: T[],
  boundAccountIds: string[]
): T | null {
  const bound = accounts.filter((account) =>
    boundAccountIds.includes(account.id)
  );
  if (bound.length > 1)
    throw new ExternalAccountError("external_account_ambiguous");
  if (bound.length === 1) return bound[0];
  if (accounts.length > 1)
    throw new ExternalAccountError("external_account_ambiguous");
  return accounts[0] ?? null;
}
