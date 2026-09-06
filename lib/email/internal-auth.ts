import { timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isAuthorizedOutboxRequest(request: Request) {
  const secret = getEnv().INTERNAL_OUTBOX_SECRET;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  return safeEqual(authorization.slice(7), secret);
}
