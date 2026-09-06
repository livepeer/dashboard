import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertIntegrationDatabaseMarker,
  openIntegrationDatabase,
  readIntegrationDatabaseTarget,
} from "../support/isolated-db";
import {
  FixtureLedger,
  createFixtureNamespace,
  mockProviderIdentity,
} from "../support/fixtures";
import {
  createEffectRecorder,
  createMockExternalEffects,
} from "../support/effects";

const postgresMock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("postgres", () => ({ default: postgresMock.connect }));

const env = {
  TEST_DATABASE_URL:
    "postgresql://synthetic:never-real@ep-tests.example.invalid/neondb",
  TEST_DATABASE_HOST: "ep-tests.example.invalid",
  TEST_DATABASE_BRANCH_ID: "br-disposable-integration",
};

describe("disposable database safety", () => {
  it("returns only a credential-free approved target", () => {
    expect(readIntegrationDatabaseTarget(env)).toEqual({
      hostname: env.TEST_DATABASE_HOST,
      branchId: env.TEST_DATABASE_BRANCH_ID,
    });
    expect(JSON.stringify(readIntegrationDatabaseTarget(env))).not.toContain(
      "never-real"
    );
  });

  it.each([
    "TEST_DATABASE_URL",
    "TEST_DATABASE_HOST",
    "TEST_DATABASE_BRANCH_ID",
  ] as const)("requires %s independently", (key) => {
    expect(() =>
      readIntegrationDatabaseTarget({ ...env, [key]: undefined })
    ).toThrow();
  });

  it.each([
    { TEST_DATABASE_URL: "not-a-url-with-a-secret" },
    { TEST_DATABASE_URL: "https://ep-tests.example.invalid/neondb" },
    { TEST_DATABASE_HOST: "another.example.invalid" },
    { TEST_DATABASE_BRANCH_ID: "unreviewed-branch" },
  ])("rejects malformed or mismatched approval %j", (overrides) => {
    expect(() =>
      readIntegrationDatabaseTarget({ ...env, ...overrides })
    ).toThrow();
  });

  it.each([
    "ep-mute-dust-au81hdx5-pooler.c-10.us-east-1.aws.neon.tech",
    "ep-mute-dust-au81hdx5.c-10.us-east-1.aws.neon.tech",
    "ep-super-smoke-au3eh6hd-pooler.c-10.us-east-1.aws.neon.tech",
    "ep-super-smoke-au3eh6hd.c-10.us-east-1.aws.neon.tech",
    "ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech",
    "ep-dry-smoke-au7l7dzw.c-10.us-east-1.aws.neon.tech",
  ])("forbids deployed data even with a matching host: %s", (hostname) => {
    expect(() =>
      readIntegrationDatabaseTarget({
        ...env,
        TEST_DATABASE_URL: `postgresql://synthetic:never-real@${hostname}/neondb`,
        TEST_DATABASE_HOST: hostname,
      })
    ).toThrow("forbidden");
  });

  it("accepts new runtime preview endpoints in a forbidden list, including pooled aliases", () => {
    expect(() =>
      readIntegrationDatabaseTarget(env, {
        forbiddenHosts: ["ep-tests-pooler.example.invalid"],
      })
    ).toThrow("forbidden");
  });

  it.each([
    [],
    [null],
    [{}],
    [{ branchId: "br-other", purpose: "integration" }],
    [{ branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "preview" }],
    [{ branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "production" }],
    [{ branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "integration" }, {}],
  ])("rejects absent, ambiguous or nonintegration markers: %j", (...rows) => {
    expect(() =>
      assertIntegrationDatabaseMarker(readIntegrationDatabaseTarget(env), rows)
    ).toThrow();
  });

  it("accepts only the single matching integration marker", () => {
    expect(() =>
      assertIntegrationDatabaseMarker(readIntegrationDatabaseTarget(env), [
        { branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "integration" },
      ])
    ).not.toThrow();
  });

  it("does not connect before target validation", async () => {
    postgresMock.connect.mockClear();
    await expect(openIntegrationDatabase({})).rejects.toThrow();
    expect(postgresMock.connect).not.toHaveBeenCalled();
  });

  it("only reads the marker before returning a connection", async () => {
    const sql = Object.assign(
      vi
        .fn()
        .mockResolvedValue([
          { branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "integration" },
        ]),
      { end: vi.fn().mockResolvedValue(undefined) }
    );
    postgresMock.connect.mockReturnValue(sql);
    const result = await openIntegrationDatabase(env);
    expect(result.client).toBe(sql);
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0][0].join("")).toContain("SELECT branch_id");
    expect(sql.end).not.toHaveBeenCalled();
  });

  it("closes and sanitizes driver errors before a database can be used", async () => {
    const sql = Object.assign(
      vi.fn().mockRejectedValue(new Error("never-real credential detail")),
      {
        end: vi.fn().mockResolvedValue(undefined),
      }
    );
    postgresMock.connect.mockReturnValue(sql);
    await expect(openIntegrationDatabase(env)).rejects.toThrow(
      "Could not validate"
    );
    expect(sql.end).toHaveBeenCalledOnce();
  });

  it("closes connections to runtime previews when their marker is wrong", async () => {
    const sql = Object.assign(
      vi
        .fn()
        .mockResolvedValue([
          { branchId: env.TEST_DATABASE_BRANCH_ID, purpose: "preview" },
        ]),
      { end: vi.fn().mockResolvedValue(undefined) }
    );
    postgresMock.connect.mockReturnValue(sql);
    await expect(openIntegrationDatabase(env)).rejects.toThrow(
      "Could not validate"
    );
    expect(sql.end).toHaveBeenCalledOnce();
  });
});

describe("exact fixture ownership", () => {
  it("isolates namespaces and uses nondeliverable addresses", () => {
    const first = createFixtureNamespace();
    const second = createFixtureNamespace();
    expect(first.prefix).not.toBe(second.prefix);
    expect(first.email("person")).toMatch(/@example\.invalid$/);
    expect(() => first.email("*@production.org")).toThrow();
    expect(mockProviderIdentity().email).toMatch(/@example\.invalid$/);
    expect(() =>
      mockProviderIdentity({ email: "person@production.org" })
    ).toThrow();
  });

  it("cleans exact deduplicated IDs in FK-safe registration order", async () => {
    const calls: string[] = [];
    const eventId = randomUUID();
    const userId = randomUUID();
    const ledger = new FixtureLedger([
      {
        domain: "events",
        deleteIds: async (ids) => {
          calls.push(`events:${ids.join(",")}`);
        },
      },
      {
        domain: "users",
        deleteIds: async (ids) => {
          calls.push(`users:${ids.join(",")}`);
        },
      },
    ]);
    ledger.track("users", userId);
    ledger.track("events", eventId);
    ledger.track("events", eventId);
    await ledger.cleanup();
    await ledger.cleanup();
    expect(calls).toEqual([`events:${eventId}`, `users:${userId}`]);
    expect(ledger.counts()).toEqual({ events: 0, users: 0 });
  });

  it("rejects unknown domains, wildcard IDs, and duplicate domains", () => {
    const cleanup = { domain: "users", deleteIds: async () => {} };
    expect(() => new FixtureLedger([cleanup, cleanup])).toThrow();
    const ledger = new FixtureLedger([cleanup]);
    expect(() => ledger.track("unknown", randomUUID())).toThrow();
    expect(() => ledger.track("users", "%")).toThrow();
  });

  it("retains failed IDs for retry and does not delete parents after child failure", async () => {
    const children = vi
      .fn()
      .mockRejectedValueOnce(new Error("retry"))
      .mockResolvedValue(undefined);
    const parents = vi.fn().mockResolvedValue(undefined);
    const ledger = new FixtureLedger([
      { domain: "children", deleteIds: children },
      { domain: "parents", deleteIds: parents },
    ]);
    ledger.track("children", randomUUID());
    ledger.track("parents", randomUUID());
    await expect(ledger.cleanup()).rejects.toThrow("retry");
    expect(parents).not.toHaveBeenCalled();
    expect(ledger.counts()).toEqual({ children: 1, parents: 1 });
    await ledger.cleanup();
    expect(ledger.counts()).toEqual({ children: 0, parents: 0 });
  });

  it("prevents overlapping cleanup and fixture insertion while deleting", async () => {
    let finish!: () => void;
    const ledger = new FixtureLedger([
      {
        domain: "users",
        deleteIds: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      },
    ]);
    ledger.track("users", randomUUID());
    const pending = ledger.cleanup();
    expect(() => ledger.track("users", randomUUID())).toThrow();
    await expect(ledger.cleanup()).rejects.toThrow("already in progress");
    finish();
    await pending;
  });
});

describe("external effect doubles", () => {
  it("rejects unconfigured effects and records the attempted call", async () => {
    const effects = createMockExternalEffects();
    effects.assertNoCalls();
    await expect(effects.mint.invoke({ user: "synthetic" })).rejects.toThrow();
    expect(() => effects.assertNoCalls()).toThrow();
    effects.reset();
    effects.assertNoCalls();
  });

  it("records a payload snapshot and never dispatches real network operations", async () => {
    const recorder = createEffectRecorder<{ value: number }, string>();
    recorder.respondWith(({ value }) => `test-${value}`);
    const input = { value: 1 };
    expect(await recorder.invoke(input)).toBe("test-1");
    input.value = 2;
    expect(recorder.calls).toEqual([{ value: 1 }]);
    recorder.reset();
    await expect(recorder.invoke(input)).rejects.toThrow();
  });
});
