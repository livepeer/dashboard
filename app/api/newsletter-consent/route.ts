import { cookies } from "next/headers";
import { z } from "zod";
import { dispatchOutboxEvent } from "@/lib/email/outbox";
import { changeNewsletterConsent } from "@/lib/subscriptions/service";
import { getSignupForSession } from "@/lib/waitlist/queries";
import { SESSION_COOKIE } from "@/lib/waitlist/security";
import { apiError, requireSameOrigin } from "@/lib/admin/http";
export const runtime = "nodejs";
const consentSchema = z.object({ newsletterOptIn: z.boolean() });
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const current = await getSignupForSession(
      (await cookies()).get(SESSION_COOKIE)?.value
    );
    if (!current)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const parsed = consentSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "invalid_preference" }, { status: 400 });
    const outboxId = await changeNewsletterConsent(
      current.signup.id,
      parsed.data.newsletterOptIn,
      "home_panel"
    );
    if (outboxId) {
      try {
        await dispatchOutboxEvent(outboxId);
      } catch {
        /* Durable retry retains the committed preference. */
      }
    }
    return Response.json(parsed.data);
  } catch (error) {
    return apiError(error);
  }
}
