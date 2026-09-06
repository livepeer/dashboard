import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import { enrollAuthenticatedUser } from "@/lib/access/enrollment";
import { getAccessDecision } from "@/lib/access/service";
import { apiError } from "@/lib/admin/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const identity = await getAuthenticatedIdentity();
    if (!identity)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const canonical = await resolveProviderIdentity(identity);
    await enrollAuthenticatedUser(identity, canonical);
    const decision = await getAccessDecision(canonical.userId);
    return Response.json(decision, {
      status: decision.state === "unavailable" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
