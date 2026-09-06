import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { hashToken, SESSION_COOKIE } from "@/lib/waitlist/security";
import { apiError, requireSameOrigin } from "@/lib/admin/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    return apiError(error);
  }
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (rawToken) {
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(rawToken)));
  }
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ message: "Signed out." });
}
