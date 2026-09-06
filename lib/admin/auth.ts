import "server-only";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import { enrollAuthenticatedUser } from "@/lib/access/enrollment";
import { getAdminPrincipalForUser } from "./permissions";
export { getAdminPrincipalForUser } from "./permissions";

export async function getAdminPrincipal() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null;
  const canonical = await resolveProviderIdentity(identity);
  await enrollAuthenticatedUser(identity, canonical);
  return getAdminPrincipalForUser(canonical.userId);
}
