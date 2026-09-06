import "server-only";
import { redirect } from "next/navigation";
import { consoleSignInHref, safeReturnTo } from "@/lib/console/auth-login";
import { requireConsoleSession } from "@/lib/console/session-user";

/** Page admission is only presentation of the same gate enforced by APIs. */
export async function requireConsolePage(returnTo = "/home") {
  // Explicit local design fixture only; never active in deployed Next builds.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.CONSOLE_DEV_MOCK === "1"
  )
    return;
  let session;
  try {
    session = await requireConsoleSession();
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? error.status
        : 503;
    if (status === 401) redirect(consoleSignInHref({ returnTo }));
    redirect(
      `/access-pending?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
    );
  }
  return session;
}
