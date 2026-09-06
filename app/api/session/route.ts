import { getCurrentWaitlistSession } from "@/lib/waitlist/current-session";
import { apiError } from "@/lib/admin/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getCurrentWaitlistSession();
    if (!session) {
      return Response.json(
        { message: "Authentication required." },
        { status: 401 }
      );
    }
    return Response.json(session, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
