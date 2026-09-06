import { cookies } from "next/headers";

import type { WaitlistSessionResponse } from "@/lib/waitlist/contracts";
import { getMember, getSignupForSession } from "@/lib/waitlist/queries";
import { SESSION_COOKIE } from "@/lib/waitlist/security";

export async function getCurrentWaitlistSession(): Promise<WaitlistSessionResponse | null> {
  try {
    const rawToken = (await cookies()).get(SESSION_COOKIE)?.value;
    const current = await getSignupForSession(rawToken);
    if (!current) return null;

    return { member: await getMember(current.signup) };
  } catch (error) {
    console.error("waitlist_session_lookup_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
