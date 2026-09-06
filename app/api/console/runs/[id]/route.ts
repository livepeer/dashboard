import { getOwnRun } from "@/lib/runs/store";
import { requireRunOwner, runError, RUN_HEADERS } from "@/lib/runs/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await requireRunOwner();
    const { id } = await context.params;
    const result = await getOwnRun(owner, id);
    if (!result) throw new Error("run_not_found");
    return Response.json(result, { headers: RUN_HEADERS });
  } catch (error) {
    return runError(error);
  }
}
