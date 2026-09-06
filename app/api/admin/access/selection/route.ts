import { getAdminPrincipal } from "@/lib/admin/auth";
import { apiError } from "@/lib/admin/http";
import { freezeAccessSelection, parseAccessFilters } from "@/lib/admin/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!(await getAdminPrincipal()))
      return Response.json({ error: "admin_required" }, { status: 403 });
    return Response.json(
      await freezeAccessSelection(
        parseAccessFilters(new URL(request.url).searchParams)
      ),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
