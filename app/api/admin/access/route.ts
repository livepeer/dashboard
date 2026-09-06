import { getAdminPrincipal } from "@/lib/admin/auth";
import { apiError, requireSameOrigin } from "@/lib/admin/http";
import {
  bulkAccessSchema,
  dispatchSelectionInvitations,
  listAccessEntries,
  mutateAccessSelection,
  parseAccessFilters,
} from "@/lib/admin/access";
import { after } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!(await getAdminPrincipal()))
      return Response.json({ error: "admin_required" }, { status: 403 });
    return Response.json(
      await listAccessEntries(
        parseAccessFilters(new URL(request.url).searchParams)
      ),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getAdminPrincipal();
    if (!actor)
      return Response.json({ error: "admin_required" }, { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 20_000)
      return Response.json({ error: "selection_too_large" }, { status: 400 });
    const parsed = bulkAccessSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "invalid_selection" }, { status: 400 });
    const result = await mutateAccessSelection(actor, parsed.data);
    after(async () => {
      try {
        await dispatchSelectionInvitations(actor, result.requestId);
      } catch {
        console.error("approval_invitation_dispatch_deferred");
      }
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
