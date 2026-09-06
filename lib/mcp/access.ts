import "server-only";
import {
  AccessError,
  requireApprovedExternalAccount,
} from "@/lib/access/service";
import { configuredPymthouseScope } from "@/lib/external-accounts/service";

/** Configuration and database failures must never become an authorization fallback. */
export async function requireApprovedMcpAccount(externalUserId: string) {
  try {
    return await requireApprovedExternalAccount(
      configuredPymthouseScope(),
      externalUserId
    );
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError("unavailable");
  }
}
