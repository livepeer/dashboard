import { getAdminPrincipal } from "@/lib/admin/auth";
import { getAdminRun } from "@/lib/runs/store";
import { runError, RUN_HEADERS } from "@/lib/runs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAdminPrincipal();
    if (!actor)
      return Response.json(
        { error: "admin_required" },
        { status: 403, headers: RUN_HEADERS }
      );
    const { id } = await context.params;
    const result = await getAdminRun(actor, id);
    if (!result) throw new Error("run_not_found");
    return Response.json(result, { headers: RUN_HEADERS });
  } catch (error) {
    return runError(error);
  }
}
