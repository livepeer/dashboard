import { readFileSync } from "node:fs";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import { classifyJournal } from "../../scripts/db/compact-migrations";
import { consoleMigrationTarget } from "../../scripts/db/migrate-console";

const legacy = readMigrationFiles({ migrationsFolder: "drizzle" });
const active = readMigrationFiles({ migrationsFolder: "drizzle-baseline" });
const entries = (migrations: MigrationMeta[]) =>
  migrations.map((m) => ({ hash: m.hash, created_at: m.folderMillis }));

describe("full baseline transition", () => {
  it("routes generation and migration through the baseline-aware entry points", () => {
    expect(readFileSync("drizzle.config.ts", "utf8")).toContain(
      'out: "./drizzle-baseline"'
    );
    expect(
      JSON.parse(readFileSync("package.json", "utf8")).scripts["db:migrate"]
    ).toBe("tsx scripts/db/migrate-console.ts");
  });
  it("requires an explicit database target and rejects connection overrides", () => {
    const env = {
      DATABASE_URL: "postgresql://fixture:fixture@preview.invalid/neondb",
      MIGRATION_EXPECTED_HOST: "preview.invalid",
      MIGRATION_EXPECTED_DATABASE: "neondb",
    };
    expect(consoleMigrationTarget(env).local).toBe(false);
    for (const changes of [
      { MIGRATION_EXPECTED_HOST: undefined },
      { MIGRATION_EXPECTED_HOST: "other.invalid" },
      { MIGRATION_EXPECTED_DATABASE: "other" },
      { DATABASE_URL: env.DATABASE_URL + "?host=other.invalid" },
      { DATABASE_URL: env.DATABASE_URL + "?options=-csearch_path=other" },
    ])
      expect(() => consoleMigrationTarget({ ...env, ...changes })).toThrow();
  });
  it("pins every original hash and a single equivalent final snapshot", () => {
    const manifest = JSON.parse(
      readFileSync("drizzle-baseline/source-manifest.json", "utf8")
    );
    expect(active).toHaveLength(1);
    expect(
      legacy.map((m) => ({ sha256: m.hash, when: m.folderMillis }))
    ).toEqual(
      manifest.sourceMigrations.map(
        ({ sha256, when }: { sha256: string; when: number }) => ({
          sha256,
          when,
        })
      )
    );
    expect(active[0].hash).toBe(manifest.candidateMigration.sha256);
    expect(active[0].folderMillis).toBeGreaterThan(legacy.at(-1)!.folderMillis);
    const old = JSON.parse(
      readFileSync("drizzle/meta/0010_snapshot.json", "utf8")
    );
    const baseline = JSON.parse(
      readFileSync("drizzle-baseline/meta/0000_snapshot.json", "utf8")
    );
    for (const key of Object.keys(old).filter(
      (k) => !["id", "prevId"].includes(k)
    ))
      expect(baseline[key]).toEqual(old[key]);
    expect(baseline.prevId).toBe("00000000-0000-0000-0000-000000000000");
  });
  it("supports fresh installs, every exact original prefix, baseline and adopted journals", () => {
    expect(classifyJournal([], legacy, active).kind).toBe("fresh");
    for (let n = 1; n <= legacy.length; n++)
      expect(
        classifyJournal(entries(legacy.slice(0, n)), legacy, active)
      ).toEqual({ kind: "legacy", applied: n });
    expect(classifyJournal(entries(active), legacy, active).kind).toBe(
      "baseline"
    );
    expect(
      classifyJournal(entries([...legacy, ...active]), legacy, active).kind
    ).toBe("adopted");
  });
  it("rejects changed hashes, timestamps, gaps, duplicates and premature adoption", () => {
    for (const rows of [
      [{ ...entries(legacy)[0], hash: "tampered" }],
      [{ ...entries(legacy)[0], created_at: 1 }],
      entries([legacy[0], legacy[2]]),
      entries([legacy[0], legacy[0]]),
      entries([...legacy.slice(0, 5), ...active]),
      entries([...legacy, ...active, ...active]),
      entries([...active, legacy[0]]),
    ])
      expect(() => classifyJournal(rows, legacy, active)).toThrow();
  });
  it("accepts the same future chain for both baseline and adopted databases", () => {
    const future = {
      ...active[0],
      hash: "future",
      folderMillis: active[0].folderMillis + 1,
    };
    const chain = [...active, future];
    expect(classifyJournal(entries(chain), legacy, chain)).toEqual({
      kind: "baseline",
      applied: 2,
    });
    expect(
      classifyJournal(entries([...legacy, ...chain]), legacy, chain)
    ).toEqual({ kind: "adopted", applied: 2 });
  });
});
