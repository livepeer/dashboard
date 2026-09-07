import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("run migration rollout guard", () => {
  it("keeps audit immutability and owner binding in migration SQL, including truncate", () => {
    const sql = readFileSync("drizzle/0010_run_records.sql", "utf8");
    for (const trigger of [
      "run_events_immutable",
      "run_events_immutable_truncate",
      "run_read_audits_immutable",
      "run_read_audits_immutable_truncate",
      "runs_owner_binding",
    ])
      expect(sql).toContain(`CREATE TRIGGER "${trigger}"`);
    expect(sql).toContain("account.user_id = NEW.user_id");
    expect(sql).toContain("account.external_user_id = NEW.principal_id");
  });
});
