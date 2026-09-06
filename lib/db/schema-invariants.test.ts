import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  authIdentities,
  emailOutbox,
  pointEvents,
  sessions,
  userEmails,
  users,
  verificationTokens,
  waitlistSignups,
  mcpAssets,
  runs,
} from "@/lib/db/schema";

function uniqueIndexColumns(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table)
    .indexes.filter((index) => index.config.unique)
    .map((index) =>
      index.config.columns.map((column) =>
        "name" in column ? column.name : String(column)
      )
    );
}

describe("database-enforced adversarial invariants", () => {
  it("models durable run arguments and independently-lived media references", () => {
    expect(runs.submittedArguments.dataType).toBe("json");
    expect(runs.submittedArguments.hasDefault).toBe(false);
    expect(runs.status.default).toBe("queued");
    expect(uniqueIndexColumns(runs)).toContainEqual([
      "principal_id",
      "gateway_request_id",
    ]);
    expect(mcpAssets.runId.notNull).toBe(false);
    for (const column of [
      mcpAssets.availableUntil,
      mcpAssets.expiresAt,
      mcpAssets.unavailableAt,
    ]) {
      expect(column.hasDefault).toBe(false);
      expect(column.notNull).toBe(false);
    }
    const fk = getTableConfig(mcpAssets).foreignKeys.find(
      (key) => key.getName() === "mcp_assets_run_owner_fk"
    )!;
    expect(fk.reference().columns.map((column) => column.name)).toEqual([
      "run_id",
      "principal_id",
      "gateway_request_id",
    ]);
    expect(fk.onDelete).toBe("restrict");
  });
  it("prevents duplicate referral awards for the same reason and signup", () => {
    expect(uniqueIndexColumns(pointEvents)).toContainEqual([
      "reason",
      "referral_signup_id",
    ]);
  });

  it("prevents verification and session token hash reuse", () => {
    expect(uniqueIndexColumns(verificationTokens)).toContainEqual([
      "token_hash",
    ]);
    expect(uniqueIndexColumns(sessions)).toContainEqual(["token_hash"]);
  });

  it("prevents duplicate outbox jobs sharing an idempotency key", () => {
    expect(uniqueIndexColumns(emailOutbox)).toContainEqual(["idempotency_key"]);
  });

  it("stores requested consent on the verification proof", () => {
    const column = verificationTokens.requestedMarketingConsent;
    expect(column.notNull).toBe(true);
    expect(column.hasDefault).toBe(true);
  });

  it("defaults new accounts to the non-privileged member role", () => {
    const column = waitlistSignups.accountRole;
    expect(column.notNull).toBe(true);
    expect(column.hasDefault).toBe(true);
    expect(column.default).toBe("member");
  });

  it("supports durable outbox retry and leasing state", () => {
    expect(emailOutbox.attemptCount.notNull).toBe(true);
    expect(emailOutbox.attemptCount.hasDefault).toBe(true);
    expect(emailOutbox.nextAttemptAt.notNull).toBe(true);
    expect(emailOutbox.nextAttemptAt.hasDefault).toBe(true);
    expect(emailOutbox.lockedAt.notNull).toBe(false);
    expect(emailOutbox.terminalAt.notNull).toBe(false);
    expect(emailOutbox.lastErrorCode.notNull).toBe(false);
  });

  it("keeps canonical identities and verified emails unique", () => {
    expect(uniqueIndexColumns(authIdentities)).toContainEqual([
      "provider",
      "provider_subject",
    ]);
    expect(uniqueIndexColumns(authIdentities)).toContainEqual([
      "external_user_id",
    ]);
    expect(uniqueIndexColumns(userEmails)).toContainEqual(["normalized_email"]);
    expect(users.id.notNull).toBe(true);
  });

  it("allows waitlist-only contacts and limits canonical membership", () => {
    expect(waitlistSignups.userId.notNull).toBe(false);
    expect(uniqueIndexColumns(waitlistSignups)).toContainEqual(["user_id"]);
  });

  it("scopes MCP asset uniqueness to the principal", () => {
    expect(uniqueIndexColumns(mcpAssets)).toContainEqual([
      "principal_id",
      "gateway_request_id",
      "url",
    ]);
    expect(uniqueIndexColumns(mcpAssets)).not.toContainEqual([
      "gateway_request_id",
      "url",
    ]);
  });
});
