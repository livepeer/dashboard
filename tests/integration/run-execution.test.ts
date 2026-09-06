import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import * as schema from "@/lib/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import * as runStore from "@/lib/runs/store";
import { requireApprovedMcpAccount } from "@/lib/mcp/access";
import {
  executeDurableRun,
  type ExecutionDependencies,
} from "@/lib/runs/execute";
import type { McpPrincipal } from "@/lib/mcp/jwt";

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "captures no-cost MCP executions through real scoped ownership, SQL lifecycle, assets, and audited readers",
  async () => {
    const { client } = await openIntegrationDatabase(process.env);
    const rollback = new Error("rollback_mcp_execution_integration");
    vi.stubEnv("PYMTHOUSE_ISSUER_URL", "https://execution.example.invalid");
    vi.stubEnv("PYMTHOUSE_PUBLIC_CLIENT_ID", "execution-fixture");
    try {
      await expect(
        drizzle(client, { schema }).transaction(async (tx) => {
          const namespace = `execution_${randomUUID().replaceAll("-", "")}`;
          await tx.execute(sql.raw(`CREATE SCHEMA "${namespace}"`));
          await tx.execute(
            sql.raw(`SET LOCAL search_path TO "${namespace}", public`)
          );
          const journal = JSON.parse(
            readFileSync("drizzle-baseline/meta/_journal.json", "utf8")
          );
          for (const { tag } of journal.entries)
            for (const statement of readFileSync(
              `drizzle-baseline/${tag}.sql`,
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
          const email = "run-execution@example.invalid";
          await tx
            .insert(schema.userEmails)
            .values({
              userId: user.id,
              email,
              normalizedEmail: email,
              source: "test",
              isPrimary: true,
              verifiedAt: new Date(),
            });
          const [signup] = await tx
            .insert(schema.waitlistSignups)
            .values({
              userId: user.id,
              email,
              normalizedEmail: email,
              referralCode: "execution-fixture",
              status: "confirmed",
              confirmedAt: new Date(),
              firstTouch: {},
              lastTouch: {},
            })
            .returning();
          await tx
            .insert(schema.accessGrants)
            .values({
              userId: user.id,
              signupId: signup.id,
              status: "approved",
              approvedAt: new Date(),
              source: "test",
            });
          const [adminGrant] = await tx
            .insert(schema.adminRoleGrants)
            .values({ signupId: signup.id, source: "test" })
            .returning();
          const [account] = await tx
            .insert(schema.externalAccounts)
            .values({
              userId: user.id,
              service: "pymthouse",
              issuer: "https://execution.example.invalid",
              appId: "execution-fixture",
              externalUserId: "eu_execution_fixture",
              source: "test",
            })
            .returning();
          const principal: McpPrincipal = {
            sub: "auth0|fixture",
            externalUserId: account.externalUserId,
            publicClientId: "execution-fixture",
            scope: "sign:job",
            token: "never-retain-this-bearer",
          };
          expect(
            (await requireApprovedMcpAccount(principal.externalUserId)).state
          ).toBe("approved");
          const owner = await runStore.resolveRunOwner(
            principal.externalUserId
          );
          expect(owner).toEqual({
            userId: user.id,
            principalId: account.externalUserId,
            externalAccountId: account.id,
          });

          const deps: ExecutionDependencies = {
            store: runStore,
            checkSpend: vi.fn().mockResolvedValue(undefined),
            describe: vi.fn().mockResolvedValue({ mode: "single-shot" }),
            infer: vi.fn().mockImplementation(async (request) => {
              // Check the real durable row exists before the provider mock starts.
              const [beforeDispatch] = await tx
                .select()
                .from(schema.runs)
                .where(
                  eq(schema.runs.gatewayRequestId, request.gatewayRequestId)
                );
              expect(beforeDispatch.status).toBe("running");
              return {
                url: "https://v3.fal.media/files/fixture-a.png",
                gatewayRequestId: request.gatewayRequestId,
                providerRequestId: "provider-fixture",
                status: "COMPLETED",
                data: {
                  images: [
                    { url: "https://v3.fal.media/files/fixture-a.png" },
                    { url: "https://v3.fal.media/files/fixture-b.png" },
                  ],
                  metadata: { seed: 42 },
                },
              };
            }),
          };
          const args = {
            capability: "fal-ai/fixture",
            inputs: {
              nested: { values: [1, true, { seed: 42 }] },
              prompt: "A fictional lighthouse",
              api_key: "never-retain-this-key",
              image_url:
                "https://example.invalid/input.png?token=never-retain-url-token&width=512",
            },
          };
          const response = await executeDurableRun(principal, args, deps);
          expect(response.isError).toBe(false);
          expect(deps.infer).toHaveBeenCalledTimes(1);
          const saved = await runStore.getOwnRun(
            owner,
            response.payload.run_id as string
          );
          expect(saved?.status).toBe("succeeded");
          expect(saved?.submittedArguments?.inputs).toEqual({
            nested: args.inputs.nested,
            prompt: args.inputs.prompt,
            api_key: "[REDACTED]",
            image_url:
              "https://example.invalid/input.png?token=%5BREDACTED%5D&width=512",
          });
          expect(saved?.result?.value).toEqual({
            images: [
              { url: "https://v3.fal.media/files/fixture-a.png" },
              { url: "https://v3.fal.media/files/fixture-b.png" },
            ],
            metadata: { seed: 42 },
          });
          expect(saved?.assets.map((asset) => asset.url).sort()).toEqual([
            "https://v3.fal.media/files/fixture-a.png",
            "https://v3.fal.media/files/fixture-b.png",
          ]);
          expect(saved?.events.map((event) => event.eventKey).sort()).toEqual([
            "created",
            "dispatch-returned",
            "dispatch-started",
          ]);
          expect(JSON.stringify(saved)).not.toContain("never-retain");
          expect(
            await runStore.getOwnRun(
              { ...owner, userId: randomUUID() },
              saved!.id
            )
          ).toBeNull();

          const actor = {
            userId: user.id,
            signupId: signup.id,
            adminGrantId: adminGrant.id,
          };
          expect(
            (await runStore.listAdminRuns(actor, { search: email })).items.map(
              (run) => run.id
            )
          ).toEqual([saved!.id]);
          expect((await runStore.getAdminRun(actor, saved!.id))?.id).toBe(
            saved!.id
          );
          const audits = await tx.select().from(schema.runReadAudits);
          expect(audits.map((audit) => audit.action).sort()).toEqual([
            "detail",
            "list",
          ]);
          expect(JSON.stringify(audits)).not.toContain("fictional lighthouse");

          // A real database INSERT error rolls back its savepoint and blocks paid work.
          await tx.execute(
            sql.raw(
              `CREATE FUNCTION "${namespace}".reject_fixture_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.capability = 'fixture/fail-before-dispatch' THEN RAISE EXCEPTION 'fixture forced database failure'; END IF; RETURN NEW; END $$`
            )
          );
          await tx.execute(
            sql.raw(
              `CREATE TRIGGER reject_fixture_run BEFORE INSERT ON runs FOR EACH ROW EXECUTE FUNCTION "${namespace}".reject_fixture_run()`
            )
          );
          vi.mocked(deps.infer).mockClear();
          vi.mocked(deps.checkSpend).mockClear();
          const rejected = await executeDurableRun(
            principal,
            { capability: "fixture/fail-before-dispatch" },
            deps
          );
          expect(rejected.payload.error).toBe("run_store_unavailable");
          expect(deps.infer).not.toHaveBeenCalled();
          expect(deps.checkSpend).not.toHaveBeenCalled();
          expect(
            await tx
              .select()
              .from(schema.runs)
              .where(eq(schema.runs.capability, "fixture/fail-before-dispatch"))
          ).toEqual([]);

          vi.mocked(deps.infer).mockImplementation(
            async (request) =>
              ({
                gatewayRequestId: request.gatewayRequestId,
                data: "A text-only result",
                status: null,
                url: null,
              }) as never
          );
          const textReply = await executeDurableRun(
            principal,
            { capability: "fixture/text" },
            deps
          );
          const textRun = await runStore.getOwnRun(
            owner,
            textReply.payload.run_id as string
          );
          expect(textRun?.status).toBe("succeeded");
          expect(textRun?.result?.value).toBe("A text-only result");
          expect(textRun?.assets).toEqual([]);

          vi.mocked(deps.infer).mockImplementation(
            async (request) =>
              ({
                gatewayRequestId: request.gatewayRequestId,
                data: { request_id: "receipt" },
                status: "UNRECOGNIZED_PROVIDER_STATE",
                statusUrl:
                  "https://queue.fal.run/fal-ai/fixture/requests/receipt/status",
                responseUrl:
                  "https://queue.fal.run/fal-ai/fixture/requests/receipt",
              }) as never
          );
          const pendingReply = await executeDurableRun(
            principal,
            { capability: "fixture/queued" },
            deps
          );
          const pendingRun = await runStore.getOwnRun(
            owner,
            pendingReply.payload.run_id as string
          );
          expect(pendingRun?.status).toBe("unknown");
          expect(pendingRun?.completedAt).toBeNull();
          expect(pendingRun?.assets).toEqual([]);
          const [recovery] = await tx
            .select()
            .from(schema.runReconciliationJobs)
            .where(eq(schema.runReconciliationJobs.runId, pendingRun!.id));
          expect(recovery.queue).toEqual({
            statusUrl:
              "https://queue.fal.run/fal-ai/fixture/requests/receipt/status",
            resultUrl: "https://queue.fal.run/fal-ai/fixture/requests/receipt",
          });
          expect(await tx.select().from(schema.emailOutbox)).toEqual([]);
          throw rollback;
        })
      ).rejects.toBe(rollback);
    } finally {
      vi.unstubAllEnvs();
      await client.end();
    }
  },
  90000
);
