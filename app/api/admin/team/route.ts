import { getAdminPrincipal } from "@/lib/admin/auth";
import { apiError, requireSameOrigin } from "@/lib/admin/http";
import {
  addAdmin,
  addAdminSchema,
  listAdminTeam,
  revokeAdmin,
  revokeAdminSchema,
} from "@/lib/admin/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getAdminPrincipal();
    if (!actor)
      return Response.json({ error: "admin_required" }, { status: 403 });
    return Response.json(await listAdminTeam(actor), {
      headers: { "cache-control": "no-store" },
    });
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
    if (Number(request.headers.get("content-length") ?? 0) > 1_000)
      return Response.json({ error: "invalid_admin_email" }, { status: 400 });
    const parsed = addAdminSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "invalid_admin_email" }, { status: 400 });
    return Response.json(await addAdmin(actor, parsed.data), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getAdminPrincipal();
    if (!actor)
      return Response.json({ error: "admin_required" }, { status: 403 });
    const parsed = revokeAdminSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "invalid_admin_grant" }, { status: 400 });
    return Response.json(await revokeAdmin(actor, parsed.data.grantId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
