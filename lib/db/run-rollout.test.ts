import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertRunMigrationTarget } from "@/scripts/runs/migrate-preview";

describe("run migration rollout guard", () => {
  const env = {
    PREVIEW_RUNS_BRANCH_ID: "br-holy-sound-auugm104",
    PREVIEW_RUNS_DATABASE_URL:
      "postgresql://synthetic:synthetic@ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require",
  };
  it("requires explicit isolated preview credentials and never falls back to DATABASE_URL", () => {
    expect(() =>
      assertRunMigrationTarget({ DATABASE_URL: env.PREVIEW_RUNS_DATABASE_URL })
    ).toThrow("preview_runs_branch_guard_failed");
    expect(() =>
      assertRunMigrationTarget({
        PREVIEW_RUNS_BRANCH_ID: env.PREVIEW_RUNS_BRANCH_ID,
        DATABASE_URL: env.PREVIEW_RUNS_DATABASE_URL,
      })
    ).toThrow("preview_runs_database_url_required");
    expect(assertRunMigrationTarget(env).ownerUrl).toBe(
      env.PREVIEW_RUNS_DATABASE_URL
    );
  });
  it("rejects production, arbitrary hosts, database names and URL parameter target overrides", () => {
    for (const override of [
      { PREVIEW_RUNS_BRANCH_ID: "br-wild-boat-auv00x69" },
      {
        PREVIEW_RUNS_DATABASE_URL:
          "postgresql://synthetic@production.invalid/neondb",
      },
      {
        PREVIEW_RUNS_DATABASE_URL: env.PREVIEW_RUNS_DATABASE_URL.replace(
          "/neondb",
          "/other"
        ),
      },
      {
        PREVIEW_RUNS_DATABASE_URL: `${env.PREVIEW_RUNS_DATABASE_URL}&host=production.invalid`,
      },
      {
        PREVIEW_RUNS_DATABASE_URL: `${env.PREVIEW_RUNS_DATABASE_URL}&options=-csearch_path=other`,
      },
    ])
      expect(() => assertRunMigrationTarget({ ...env, ...override })).toThrow();
  });
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
