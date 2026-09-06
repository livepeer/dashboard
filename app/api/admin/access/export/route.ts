import { z } from "zod";
import { getAdminPrincipal } from "@/lib/admin/auth";
import { apiError, requireSameOrigin } from "@/lib/admin/http";
import { exportAccessSelection } from "@/lib/admin/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z
  .object({ signupIds: z.array(z.string().uuid()).min(1).max(500) })
  .strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!(await getAdminPrincipal()))
      return Response.json({ error: "admin_required" }, { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 25000)
      return Response.json({ error: "invalid_selection" }, { status: 400 });
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json({ error: "invalid_selection" }, { status: 400 });
    return Response.json(
      { rows: await exportAccessSelection(parsed.data.signupIds) },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
