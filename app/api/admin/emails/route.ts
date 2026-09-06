import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getAdminPrincipal } from "@/lib/admin/auth";
import { apiError } from "@/lib/admin/http";
import { getDb } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (
      process.env.VERCEL_ENV !== "preview" ||
      process.env.EMAIL_DELIVERY_MODE !== "capture"
    )
      return new Response(null, { status: 404 });
    if (!(await getAdminPrincipal()))
      return Response.json({ error: "admin_required" }, { status: 403 });
    const events = await getDb()
      .select({
        id: emailOutbox.id,
        eventType: emailOutbox.eventType,
        payload: emailOutbox.payload,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .where(
        and(
          isNotNull(emailOutbox.processedAt),
          eq(emailOutbox.lastErrorCode, "captured")
        )
      )
      .orderBy(desc(emailOutbox.createdAt))
      .limit(100);
    return Response.json(
      { events },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
