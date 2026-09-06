import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { oauthCodeRedemptions } from "@/lib/db/schema";
import { AccessError } from "@/lib/access/service";

/** Consume before minting, once across all instances. Never store the code. */
export async function consumeAuthorizationCode(
  code: string,
  expiresAt: number
) {
  code = code.trim();
  if (!code || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    return false;
  try {
    const rows = await getDb()
      .insert(oauthCodeRedemptions)
      .values({
        codeHash: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(expiresAt),
      })
      .onConflictDoNothing()
      .returning({ codeHash: oauthCodeRedemptions.codeHash });
    return rows.length === 1;
  } catch {
    throw new AccessError("unavailable", "code_redemption_unavailable");
  }
}
