import { dispatchPendingOutbox } from "@/lib/email/outbox";
import { isAuthorizedOutboxRequest } from "@/lib/email/internal-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorizedOutboxRequest(request)) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await dispatchPendingOutbox();
    return Response.json(result);
  } catch (error) {
    console.error("email_outbox_dispatch_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      { message: "Outbox dispatch failed." },
      { status: 503 }
    );
  }
}
