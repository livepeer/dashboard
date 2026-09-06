import { getAdminPrincipal } from "@/lib/admin/auth";
import { listAdminRuns } from "@/lib/runs/store";
import { parseRunQuery, runError, RUN_HEADERS } from "@/lib/runs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await getAdminPrincipal();
    if (!actor)
      return Response.json(
        { error: "admin_required" },
        { status: 403, headers: RUN_HEADERS }
      );
    return Response.json(
      await listAdminRuns(actor, parseRunQuery(request.url)),
      { headers: RUN_HEADERS }
    );
  } catch (error) {
    return runError(error);
  }
}
