import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import * as schema from "@/lib/db/schema";
import type { RunOwner } from "@/lib/runs/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import {
  claimReconciliationJobs,
  createRun,
  getOwnRun,
  releaseReconciliationJob,
  transitionRun,
} from "@/lib/runs/store";

type Database = ReturnType<typeof getDb>;
const connection = new AsyncLocalStorage<Database>();
const namespace = `runrace_${randomUUID().replaceAll("-", "")}`;
const marker = `console-run-concurrency:${namespace}`;
let client: Awaited<ReturnType<typeof openIntegrationDatabase>>["client"];
let created = false;
let owner: RunOwner;

function gate<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function waitForGate<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(Error("Concurrent backend did not reach its barrier")),
          8000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Each call owns a real transaction/backend, not a shared transaction/savepoint.
async function session<T>(
  work: (db: Database, pid: number) => Promise<T>
): Promise<T> {
  return drizzle(client, { schema }).transaction(async (tx) => {
    await tx.execute(
      sql.raw(`SET LOCAL search_path TO "${namespace}", public`)
    );
    await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
    const [backend] = await tx.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid() pid`
    );
    const db = tx as unknown as Database;
    return connection.run(db, () => work(db, Number(backend.pid)));
  }) as Promise<T>;
}

const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value, error: null }),
    (error: Error) => ({ value: null, error: error.message })
  );

/** Prove contention from PostgreSQL's lock graph, not arbitrary sleep timing. */
async function lockedRace(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>
) {
  const held = gate<number>(),
    release = gate(),
    contender = gate<number>();
  const a = outcome(
    session(async (_db, pid) => {
      try {
        const value = await first();
        held.resolve(pid);
        await release.promise;
        return value;
      } catch (error) {
        held.reject(error);
        throw error;
      }
    })
  );
  let b: ReturnType<typeof outcome<unknown>> | undefined;
  try {
    const firstPid = await waitForGate(held.promise);
    b = outcome(
      session(async (_db, pid) => {
        contender.resolve(pid);
        return second();
      })
    );
    const secondPid = await waitForGate(contender.promise);
    expect(secondPid).not.toBe(firstPid);
    let blocked = false;
    const deadline = Date.now() + 5000;
    while (!blocked && Date.now() < deadline) {
      const [state] =
        await client`SELECT ${firstPid} = ANY(pg_blocking_pids(${secondPid})) blocked`;
      blocked = state.blocked === true;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(
      blocked,
      "second real backend must wait on first backend's run lock"
    ).toBe(true);
  } finally {
    release.resolve();
    // Settle both transactions even when an assertion fails, before schema cleanup.
    await Promise.all([a, b]);
  }
  return { first: await a, second: await b! };
}

async function newRun(queue = false) {
  return session(async () => {
    const id = randomUUID();
    const run = await createRun(owner, {
      id,
      gatewayRequestId: `job_${id}`,
      capability: "synthetic",
      submittedArguments: { inputs: { prompt: "Concurrency fixture" } },
    });
    return transitionRun(owner, run.id, {
      eventKey: "dispatch",
      status: queue ? "unknown" : "running",
      ...(queue
        ? {
            queue: {
              statusUrl: `https://queue.fal.run/fal-ai/flux/requests/${id}/status`,
              resultUrl: `https://queue.fal.run/fal-ai/flux/requests/${id}`,
            },
          }
        : {}),
    });
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "real multi-connection run concurrency",
  () => {
    beforeAll(async () => {
      vi.stubEnv("PYMTHOUSE_ISSUER_URL", "https://issuer.invalid");
      vi.stubEnv("PYMTHOUSE_PUBLIC_CLIENT_ID", "run-races");
      // This suite deliberately commits synthetic fixtures. Never silently opt in.
      if (
        process.env.TEST_DATABASE_BRANCH_ID !== "br-super-bird-auln2med" ||
        process.env.TEST_DATABASE_ALLOW_COMMITTED_FIXTURES !== "run-concurrency"
      )
        throw Error(
          "Committed concurrency fixtures require explicit disposable-branch approval"
        );
      const target = new URL(process.env.TEST_DATABASE_URL!);
      if (
        target.pathname !== "/neondb" ||
        target.hash ||
        (target.port && target.port !== "5432") ||
        [...target.searchParams.keys()].some(
          (key) => !["sslmode", "channel_binding"].includes(key)
        )
      )
        throw Error("Unsafe concurrency database URL options");
      ({ client } = await openIntegrationDatabase(process.env));
      vi.mocked(getDb).mockImplementation(() => {
        const db = connection.getStore();
        if (!db) throw Error("Missing test connection scope");
        return db;
      });
      await client.begin(async (tx) => {
        await tx`SET LOCAL client_min_messages = warning`;
        await tx.unsafe(`CREATE SCHEMA "${namespace}"`);
        await tx.unsafe(`COMMENT ON SCHEMA "${namespace}" IS '${marker}'`);
        await tx.unsafe(`SET LOCAL search_path TO "${namespace}", public`);
        const journal = JSON.parse(
          readFileSync("drizzle-baseline/meta/_journal.json", "utf8")
        );
        for (const { tag } of journal.entries)
          for (const statement of readFileSync(
            `drizzle-baseline/${tag}.sql`,
            "utf8"
          ).split("--> statement-breakpoint"))
            if (statement.trim())
              await tx.unsafe(
                statement.replaceAll('"public".', `"${namespace}".`)
              );
        const [user] = await tx`INSERT INTO users DEFAULT VALUES RETURNING id`;
        const [account] =
          await tx`INSERT INTO external_accounts(user_id,service,issuer,app_id,external_user_id,source) VALUES(${user.id},'pymthouse','https://issuer.invalid','run-races',${namespace},'synthetic_concurrency_test') RETURNING id`;
        owner = {
          userId: user.id,
          externalAccountId: account.id,
          principalId: namespace,
        };
      });
      created = true;
    }, 60000);

    afterAll(async () => {
      try {
        if (created) {
          if (!/^runrace_[a-f0-9]{32}$/.test(namespace))
            throw Error("Unsafe cleanup target");
          const [row] =
            await client`SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=${namespace}`;
          if (row?.marker !== marker)
            throw Error("Refusing to remove an unowned schema");
          // Exact per-test namespace with ownership marker; never application/public schema.
          await client.begin(async (tx) => {
            await tx`SET LOCAL client_min_messages = warning`;
            await tx.unsafe(`DROP SCHEMA "${namespace}" CASCADE`);
          });
          expect(
            await client`SELECT 1 FROM pg_namespace WHERE nspname=${namespace}`
          ).toHaveLength(0);
        }
      } finally {
        await client?.end({ timeout: 2 });
        vi.unstubAllEnvs();
      }
    }, 30000);

    it.each(["duplicate", "conflicting terminal"])(
      "serializes %s completion without duplicate or mixed output",
      async (kind) => {
        const run = await newRun();
        const completion = {
          eventKey: "completed",
          status: "succeeded" as const,
          result: { value: { winner: true } },
          assets: [
            { url: "https://media.example.invalid/first.png" },
            { url: "https://media.example.invalid/second.png" },
          ],
        };
        const raced = await lockedRace(
          () => transitionRun(owner, run.id, completion),
          () =>
            transitionRun(
              owner,
              run.id,
              kind === "duplicate"
                ? completion
                : {
                    eventKey: "failed-later",
                    status: "failed",
                    result: { value: "must not overwrite" },
                    assets: [
                      { url: "https://media.example.invalid/wrong.png" },
                    ],
                  }
            )
        );
        expect(raced.first.error).toBeNull();
        expect(raced.second.error).toBeNull();
        const saved = await session(() => getOwnRun(owner, run.id));
        expect(saved?.status).toBe("succeeded");
        expect(saved?.result).toEqual(completion.result);
        expect(saved?.version).toBe(run.version + 1);
        expect(saved?.assets).toHaveLength(2);
        expect(
          saved?.events.filter((event) => event.eventKey === "completed")
        ).toHaveLength(1);
        expect(
          saved?.events.some((event) => event.eventKey === "failed-later")
        ).toBe(false);
      },
      30000
    );

    it("rejects a concurrent stale-version update after the winner commits", async () => {
      const run = await newRun();
      const raced = await lockedRace(
        () =>
          transitionRun(owner, run.id, {
            eventKey: "version-winner",
            status: "unknown",
            expectedVersion: run.version,
          }),
        () =>
          transitionRun(owner, run.id, {
            eventKey: "version-loser",
            status: "running",
            expectedVersion: run.version,
          })
      );
      expect(raced.first.error).toBeNull();
      expect(raced.second.error).toBe("run_version_conflict");
      expect((await session(() => getOwnRun(owner, run.id)))?.version).toBe(
        run.version + 1
      );
    }, 30000);

    it("competing workers skip a locked claim and cannot acquire the same job", async () => {
      const run = await newRun(true);
      const held = gate<number>(),
        release = gate();
      const first = outcome(
        session(async (_db, pid) => {
          try {
            const jobs = await claimReconciliationJobs(1);
            expect(jobs).toHaveLength(1);
            held.resolve(pid);
            await release.promise;
            return jobs;
          } catch (error) {
            held.reject(error);
            throw error;
          }
        })
      );
      try {
        const pid = await waitForGate(held.promise);
        await session(async (_db, otherPid) => {
          expect(otherPid).not.toBe(pid);
          expect(await claimReconciliationJobs(1)).toEqual([]);
        });
      } finally {
        release.resolve();
        await first;
      }
      const result = await first;
      expect(result.error).toBeNull();
      expect(result.value?.[0].runId).toBe(run.id);
      expect(await session(() => claimReconciliationJobs(1))).toEqual([]);
      await session(() =>
        transitionRun(owner, run.id, { eventKey: "done", status: "succeeded" })
      );
    }, 30000);

    it("fences a stale worker racing a replacement receipt, including stale release", async () => {
      const run = await newRun(true);
      const [lease] = await session(() => claimReconciliationJobs(1));
      expect(lease.runId).toBe(run.id);
      const queue = {
        statusUrl: "https://queue.fal.run/fal-ai/flux/requests/replaced/status",
        resultUrl: "https://queue.fal.run/fal-ai/flux/requests/replaced",
      };
      const raced = await lockedRace(
        () =>
          transitionRun(owner, run.id, {
            eventKey: "new-receipt",
            status: "unknown",
            queue,
          }),
        () =>
          transitionRun(owner, run.id, {
            eventKey: "stale-result",
            status: "succeeded",
            result: { value: "wrong provider attempt" },
            reconciliationLease: {
              jobId: lease.id,
              leaseToken: lease.leaseToken,
            },
          })
      );
      expect(raced.first.error).toBeNull();
      expect(raced.second.error).toBe("run_reconciliation_lease_lost");
      const [fresh] = await session(() => claimReconciliationJobs(1));
      expect(fresh.leaseToken).not.toBe(lease.leaseToken);
      expect(fresh.queue).toEqual(queue);
      await session(() => releaseReconciliationJob(lease, { done: true }));
      await session(async (db) => {
        const [job] = await db
          .select()
          .from(schema.runReconciliationJobs)
          .where(eq(schema.runReconciliationJobs.id, fresh.id));
        expect(job.leaseToken).toBe(fresh.leaseToken);
        expect(job.completedAt).toBeNull();
        await transitionRun(owner, run.id, {
          eventKey: "fresh-result",
          status: "succeeded",
          result: { value: "correct provider attempt" },
          reconciliationLease: {
            jobId: fresh.id,
            leaseToken: fresh.leaseToken,
          },
        });
      });
      expect(
        (await session(() => getOwnRun(owner, run.id)))?.result?.value
      ).toBe("correct provider attempt");
    }, 30000);
  }
);
