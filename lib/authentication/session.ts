import "server-only";
import { auth0 } from "@/lib/auth0";
import { auth0IdentityFromUser } from "./identity";
import type { ProviderIdentity } from "@/lib/platform/contracts";

/** The only Node session adapter that knows Auth0's claim/session shape. */
export async function getAuthenticatedIdentity(): Promise<ProviderIdentity | null> {
  const session = await auth0.getSession();
  if (!session?.user) return null;
  return auth0IdentityFromUser(session.user, process.env.AUTH0_DOMAIN ?? "");
}
