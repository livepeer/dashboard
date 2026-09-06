import { requireConsoleSession } from "@/lib/console/session-user";
import { apiError } from "@/lib/admin/http";
import type { ConsoleSessionProfile } from "@/lib/platform/contracts";
import { getAdminPrincipalForUser } from "@/lib/admin/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await requireConsoleSession();
    const strategy = session.identity.strategy;
    const profile: ConsoleSessionProfile = {
      userId: session.canonicalUserId,
      externalUserId: session.externalUserId,
      name: session.email?.split("@")[0] ?? "Member",
      email: session.email ?? "",
      isAdmin: !!(await getAdminPrincipalForUser(session.canonicalUserId)),
      provider:
        strategy === "github" || strategy === "google-oauth2"
          ? strategy === "github"
            ? "github"
            : "google"
          : "email",
    };
    return Response.json(profile, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
