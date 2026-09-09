import { getOwnRun } from "@/lib/runs/store";
import { requireRunOwner, runError, RUN_HEADERS } from "@/lib/runs/http";
import { publicRunDetail } from "@/lib/assets/public";
import {
  loadFalInputSchema,
  resolveFalCatalogEntry,
} from "@/lib/mcp/fal-input-schema";
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
    const catalog = resolveFalCatalogEntry(result);
    const inputSchema = catalog ? await loadFalInputSchema(catalog) : null;
    return Response.json(
      { ...publicRunDetail(result), inputSchema },
      { headers: RUN_HEADERS }
    );
  } catch (error) {
    return runError(error);
  }
}
