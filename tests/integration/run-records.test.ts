import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import * as schema from "@/lib/db/schema";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/external-accounts/service", () => ({
  configuredPymthouseScope: () => ({
    service: "pymthouse",
    issuer: "https://issuer.invalid",
    appId: "run-tests",
  }),
  findExternalAccountOwner: vi.fn(),
}));
import { getDb } from "@/lib/db";
import {
  claimReconciliationJobs,
  createRun,
  existingRunGatewayIds,
  getOwnRun,
  listOwnRuns,
  recordRunUsage,
  releaseReconciliationJob,
  transitionRun,
} from "@/lib/runs/store";
import { forgetAssets, listAssets } from "@/lib/mcp/store";

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "stores complete run lifecycle and hidden assets with transactional idempotency and owner isolation",
  async () => {
    const { client } = await openIntegrationDatabase(process.env);
    const rollback = new Error("rollback_run_store");
    try {
      await expect(
        drizzle(client, { schema }).transaction(async (tx) => {
          const namespace = `runs_${randomUUID().replaceAll("-", "")}`;
          await tx.execute(sql.raw(`CREATE SCHEMA "${namespace}"`));
          await tx.execute(
            sql.raw(`SET LOCAL search_path TO "${namespace}", public`)
          );
          const journal = JSON.parse(
            readFileSync("drizzle/meta/_journal.json", "utf8")
          );
          for (const { tag } of journal.entries)
            for (const statement of readFileSync(
              `drizzle/${tag}.sql`,
              "utf8"
            ).split("--> statement-breakpoint"))
              if (statement.trim())
                await tx.execute(
                  sql.raw(statement.replaceAll('"public".', `"${namespace}".`))
                );
          vi.mocked(getDb).mockReturnValue(
            tx as unknown as ReturnType<typeof getDb>
          );
          const [user] = await tx.insert(schema.users).values({}).returning();
          const [account] = await tx
            .insert(schema.externalAccounts)
            .values({
              userId: user.id,
              service: "pymthouse",
              issuer: "https://issuer.invalid",
              appId: "run-tests",
              externalUserId: "eu_run_tests",
              source: "test",
            })
            .returning();
          const owner = {
            userId: user.id,
            externalAccountId: account.id,
            principalId: account.externalUserId,
          };
          const args = {
            capability: "image",
            inputs: {
              prompt: "Lighthouse",
              seed: 42,
              nested: { values: [1, 2] },
            },
          };
          const created = await createRun(owner, {
            id: "run-1",
            gatewayRequestId: "job-1",
            capability: "image",
            submittedArguments: args,
          });
          expect(created.submittedArguments).toEqual(args);
          expect(created.result).toBeNull();
          expect(created.events).toHaveLength(1);
          await transitionRun(owner, created.id, {
            status: "running",
            eventKey: "dispatch",
          });
          await expect(
            transitionRun(owner, created.id, {
              status: "failed",
              eventKey: "stale",
              expectedVersion: 1,
            })
          ).rejects.toThrow("run_version_conflict");
          const succeeded = await transitionRun(owner, created.id, {
            status: "succeeded",
            eventKey: "result",
            result: { value: ["a", { image: "b" }] },
            assets: [
              { url: "https://example.invalid/a.png" },
              { url: "https://example.invalid/b.png" },
            ],
          });
          expect(succeeded.assets).toHaveLength(2);
          expect(succeeded.result?.value).toEqual(["a", { image: "b" }]);
          expect(
            (
              await transitionRun(owner, created.id, {
                status: "failed",
                eventKey: "duplicate-other",
              })
            ).status
          ).toBe("succeeded");
          expect(
            (
              await transitionRun(owner, created.id, {
                status: "succeeded",
                eventKey: "result",
              })
            ).events
          ).toHaveLength(3);
          expect(
            await getOwnRun({ ...owner, userId: randomUUID() }, created.id)
          ).toBeNull();
          expect(
            await existingRunGatewayIds(owner, ["job-1", "missing"])
          ).toEqual(["job-1"]);
          await expect(
            createRun(
              { ...owner, principalId: "forged" },
              {
                gatewayRequestId: "forged",
                capability: "image",
                submittedArguments: args,
              }
            )
          ).rejects.toThrow("run_owner_unresolved");
          await forgetAssets(owner.principalId);
          expect(await listAssets(owner.principalId)).toEqual([]);
          expect((await getOwnRun(owner, created.id))?.assets).toHaveLength(2);
          await expect(
            tx.transaction((nested) =>
              nested.update(schema.runEvents).set({ eventKey: "changed" })
            )
          ).rejects.toMatchObject({ cause: { code: "23514" } });
          await createRun(owner, {
            id: "run-2",
            gatewayRequestId: "job-2",
            capability: "text",
            submittedArguments: { capability: "text" },
          });
          await tx
            .update(schema.runs)
            .set({ createdAt: new Date("2025-01-01"), updatedAt: new Date() })
            .where(eq(schema.runs.id, "run-2"));
          const first = await listOwnRuns(owner, { limit: 1 });
          expect(first.items.map((row) => row.id)).toEqual(["run-1"]);
          expect(first.items[0]).not.toHaveProperty("submittedArguments");
          expect(first.counts.total).toBe(2);
          const next = await listOwnRuns(owner, {
            limit: 1,
            cursor: first.nextCursor!,
          });
          expect(next.items.map((row) => row.id)).toEqual(["run-2"]);
          await expect(
            listOwnRuns(owner, { cursor: "invalid" })
          ).rejects.toThrow("invalid_run_cursor");
          for (const id of ["tie-a", "tie-b"]) {
            await createRun(owner, {
              id,
              gatewayRequestId: id,
              capability: "tied-pagination",
              submittedArguments: { capability: "tied-pagination" },
            });
            await tx
              .update(schema.runs)
              .set({ createdAt: new Date("2024-01-01"), updatedAt: new Date() })
              .where(eq(schema.runs.id, id));
          }
          const tiedFirst = await listOwnRuns(owner, {
            search: "tied-pagination",
            limit: 1,
          });
          const tiedSecond = await listOwnRuns(owner, {
            search: "tied-pagination",
            limit: 1,
            cursor: tiedFirst.nextCursor!,
          });
          expect(tiedFirst.items.map((row) => row.id)).toEqual(["tie-b"]);
          expect(tiedSecond.items.map((row) => row.id)).toEqual(["tie-a"]);
          expect(tiedSecond.nextCursor).toBeNull();
          const beforeUsage = await getOwnRun(owner, created.id);
          const usage = [
            {
              eventId: "event-1",
              gatewayRequestId: "job-1",
              metadata: { fee: "0.01" },
            },
          ];
          await recordRunUsage(owner, usage);
          await recordRunUsage(owner, usage);
          await recordRunUsage({ ...owner, userId: randomUUID() }, [
            { eventId: "foreign", gatewayRequestId: "job-1", metadata: {} },
          ]);
          const afterUsage = await getOwnRun(owner, created.id);
          expect(
            afterUsage?.events.filter((event) =>
              event.eventKey.startsWith("usage:")
            )
          ).toHaveLength(1);
          expect(afterUsage?.version).toBe(beforeUsage?.version);
          expect(afterUsage?.status).toBe("succeeded");
          const stale = await createRun(owner, {
            id: "stale",
            gatewayRequestId: "job-stale",
            capability: "image",
            submittedArguments: args,
          });
          const old = new Date(Date.now() - 20 * 60_000);
          await tx
            .update(schema.runs)
            .set({
              createdAt: old,
              startedAt: old,
              updatedAt: old,
              status: "running",
            })
            .where(eq(schema.runs.id, stale.id));
          const pending = await createRun(owner, {
            id: "pending",
            gatewayRequestId: "job-pending",
            capability: "image",
            submittedArguments: args,
          });
          await transitionRun(owner, pending.id, {
            eventKey: "progress:IN_QUEUE:receipt",
            status: "running",
            queue: {
              statusUrl:
                "https://queue.fal.run/fal-ai/flux/requests/receipt/status",
              resultUrl: "https://queue.fal.run/fal-ai/flux/requests/receipt",
            },
          });
          const [delayedJob] = await tx
            .select()
            .from(schema.runReconciliationJobs);
          expect(delayedJob.availableAt.getTime()).toBe(
            new Date(pending.createdAt).getTime() + 15 * 60_000
          );
          expect(await claimReconciliationJobs()).toEqual([]);
          await transitionRun(owner, pending.id, {
            eventKey: "queue",
            status: "unknown",
            queue: {
              statusUrl:
                "https://queue.fal.run/fal-ai/flux/requests/receipt/status",
              resultUrl: "https://queue.fal.run/fal-ai/flux/requests/receipt",
            },
          });
          const [awakenedJob] = await tx
            .select()
            .from(schema.runReconciliationJobs);
          expect(awakenedJob.availableAt.getTime()).toBeLessThanOrEqual(
            Date.now()
          );
          expect(awakenedJob.availableAt.getTime()).toBeLessThan(
            delayedJob.availableAt.getTime()
          );
          await tx
            .update(schema.runReconciliationJobs)
            .set({ availableAt: new Date(Date.now() - 1000) });
          const [job] = await claimReconciliationJobs();
          const swept = await getOwnRun(owner, stale.id);
          expect(swept?.status).toBe("unknown");
          expect(swept?.errorCode).toBe("observation_interrupted");
          expect(
            swept?.events.find((event) =>
              event.eventKey.startsWith("observation_interrupted:")
            )?.metadata.reason
          ).toBe("queue_receipt_unavailable");
          expect((await getOwnRun(owner, "run-2"))?.status).toBe("queued");
          await transitionRun(owner, stale.id, {
            eventKey: "late-observation",
            status: "succeeded",
            result: { value: "observed later" },
            errorCode: null,
            errorMessage: null,
          });
          expect((await getOwnRun(owner, stale.id))?.status).toBe("succeeded");
          expect(job.runId).toBe(pending.id);
          expect(await claimReconciliationJobs()).toEqual([]);
          await releaseReconciliationJob(
            { ...job, leaseToken: randomUUID() },
            { done: true }
          );
          expect(
            (await tx.select().from(schema.runReconciliationJobs))[0]
              .completedAt
          ).toBeNull();
          await releaseReconciliationJob(job, { done: false });
          expect(
            (await tx.select().from(schema.runReconciliationJobs))[0].leaseToken
          ).toBeNull();
          await tx
            .update(schema.runReconciliationJobs)
            .set({ availableAt: new Date(Date.now() - 1000) });
          const [oldLease] = await claimReconciliationJobs();
          await transitionRun(owner, pending.id, {
            eventKey: "new-final-handle",
            status: "unknown",
            queue: {
              statusUrl:
                "https://queue.fal.run/fal-ai/flux/requests/new-receipt/status",
              resultUrl:
                "https://queue.fal.run/fal-ai/flux/requests/new-receipt",
            },
          });
          await expect(
            transitionRun(owner, pending.id, {
              eventKey: "obsolete-worker",
              status: "succeeded",
              result: { value: "wrong receipt" },
              reconciliationLease: {
                jobId: oldLease.id,
                leaseToken: oldLease.leaseToken,
              },
            })
          ).rejects.toThrow("run_reconciliation_lease_lost");
          await tx
            .update(schema.runReconciliationJobs)
            .set({ availableAt: new Date(Date.now() - 1000) });
          const [newLease] = await claimReconciliationJobs();
          expect(newLease.queue.resultUrl).toContain("new-receipt");
          await transitionRun(owner, pending.id, {
            eventKey: "unsupported-final-handle",
            status: "unknown",
            stopReconciliation: "unsupported_queue_handle",
          });
          await expect(
            transitionRun(owner, pending.id, {
              eventKey: "retired-worker",
              status: "succeeded",
              result: { value: "retired receipt" },
              reconciliationLease: {
                jobId: newLease.id,
                leaseToken: newLease.leaseToken,
              },
            })
          ).rejects.toThrow("run_reconciliation_lease_lost");
          await transitionRun(owner, pending.id, {
            eventKey: "late-result",
            status: "succeeded",
            result: { value: "late" },
          });
          expect((await getOwnRun(owner, pending.id))?.status).toBe(
            "succeeded"
          );
          expect(
            (await tx.select().from(schema.runReconciliationJobs))[0]
              .completedAt
          ).not.toBeNull();
          throw rollback;
        })
      ).rejects.toBe(rollback);
    } finally {
      await client.end();
    }
  },
  60000
);
