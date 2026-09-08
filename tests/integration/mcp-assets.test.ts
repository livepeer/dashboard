import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import type postgres from "postgres";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import * as schema from "@/lib/db/schema";
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { mcpAssets } from "@/lib/db/schema";

import {
  chunkIds,
  forgetAssets,
  ilikeLiteral,
  likeSubstring,
  listAssets,
  listAssetsForGatewayRequestIds,
  mapAssetRow,
  publicAssetStoreError,
  rememberAsset,
  serializeAsset,
} from "@/lib/mcp/store";

describe("mcp asset store helpers", () => {
  it("mapAssetRow exposes job ids for ticket joins", () => {
    const asset = mapAssetRow({
      id: "asset_1",
      url: "https://v3b.fal.media/files/x.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      gatewayRequestId: "job_abc",
      providerRequestId: "req-fal",
      createdAt: "2026-09-05T01:00:00.000Z",
    });
    expect(asset.gatewayRequestId).toBe("job_abc");
    expect(serializeAsset(asset)).toEqual({
      id: "asset_1",
      url: "https://v3b.fal.media/files/x.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      created_at: "2026-09-05T01:00:00.000Z",
      gateway_request_id: "job_abc",
      provider_request_id: "req-fal",
    });
  });

  it("likeSubstring escapes ILIKE metacharacters", () => {
    expect(likeSubstring("50%_off\\x")).toBe("50\\%\\_off\\\\x");
  });

  it("ilikeLiteral parameterizes ESCAPE instead of embedding ESCAPE '\\'", () => {
    const chunks = ilikeLiteral(mcpAssets.capability, "50%").queryChunks;
    const staticSql = chunks
      .filter(
        (chunk): chunk is { value: string[] } =>
          !!chunk &&
          typeof chunk === "object" &&
          "value" in chunk &&
          Array.isArray(chunk.value)
      )
      .map((chunk) => chunk.value.join(""))
      .join("");
    const params = chunks.flatMap((chunk) => {
      if (typeof chunk === "string") return [chunk];
      if (chunk && typeof chunk === "object" && "value" in chunk)
        return typeof chunk.value === "string" ? [chunk.value] : [];
      return [];
    });
    expect(staticSql).toContain("ESCAPE ");
    expect(staticSql).not.toContain("ESCAPE '\\'");
    expect(params).toContain("\\");
  });

  it("chunkIds keeps leftovers instead of truncating", () => {
    const ids = Array.from({ length: 130 }, (_, i) => `job_${i}`);
    const chunks = chunkIds(ids, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(30);
    expect(chunks.flat()).toHaveLength(130);
  });
  it.each([0, -1, 1.5, Infinity, NaN])(
    "rejects invalid chunk size %s",
    (size) => {
      expect(() => chunkIds(["job"], size)).toThrow(RangeError);
    }
  );

  it("publicAssetStoreError does not include connection details", () => {
    const payload = publicAssetStoreError({
      code: "42601",
      message: "postgresql://user:password@db/waitlist",
    });
    expect(payload.code).toBe("42601");
    expect(JSON.stringify(payload)).not.toContain("postgresql://");
    expect(JSON.stringify(payload)).not.toContain("password");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mcp asset store on guarded disposable database",
  () => {
    let client: ReturnType<typeof postgres>;
    beforeAll(async () => {
      ({ client } = await openIntegrationDatabase(process.env));
    });
    afterAll(async () => {
      await client?.end();
    });
    it("remember / list / forget persist and do not steal another principal", async () => {
      const rollback = new Error("rollback_asset_test");
      await expect(
        drizzle(client, { schema }).transaction(async (tx) => {
          const namespace = `assets_${randomUUID().replaceAll("-", "")}`;
          await tx.execute(sql.raw(`CREATE SCHEMA "${namespace}"`));
          await tx.execute(
            sql.raw(`SET LOCAL search_path TO "${namespace}", public`)
          );
          const journal = JSON.parse(
            readFileSync("drizzle-baseline/meta/_journal.json", "utf8")
          );
          for (const { tag: file } of journal.entries)
            for (const statement of readFileSync(
              `drizzle-baseline/${file}.sql`,
              "utf8"
            ).split("--> statement-breakpoint")) {
              if (statement.trim())
                await tx.execute(
                  sql.raw(statement.replaceAll('"public".', `"${namespace}".`))
                );
            }
          vi.mocked(getDb).mockReturnValue(
            tx as unknown as ReturnType<typeof getDb>
          );
          const stamp = Date.now();
          const jobId = `job_conflict_${stamp}`;
          const url = `https://example.test/conflict/${jobId}.jpg`;
          const owner = `eu_owner_${stamp}`;
          const other = `eu_other_${stamp}`;
          const ownerAsset = await rememberAsset(owner, {
            id: `asset_owner_${stamp}`,
            url,
            capability: "livepeer-example/fal-flux-schnell",
            createdAt: new Date().toISOString(),
            gatewayRequestId: jobId,
            providerRequestId: "req-owner",
          });
          const otherAsset = await rememberAsset(other, {
            id: `asset_other_${stamp}`,
            url,
            capability: "livepeer-example/fal-flux-schnell",
            createdAt: new Date().toISOString(),
            gatewayRequestId: jobId,
            providerRequestId: "req-other",
          });
          expect(ownerAsset.id).not.toBe(otherAsset.id);
          const repeated = await rememberAsset(owner, {
            ...ownerAsset,
            id: `retry_${stamp}`,
            providerRequestId: null,
          });
          expect(repeated.id).toBe(ownerAsset.id);
          expect(repeated.providerRequestId).toBe("req-owner");
          expect(await forgetAssets(owner, [])).toBe(0);
          expect(await forgetAssets(owner, [" "])).toBe(0);
          expect(await listAssets(owner, "%")).toEqual([]);

          const ownerListed = await listAssets(owner, jobId);
          const otherListed = await listAssets(other, jobId);
          expect(ownerListed).toHaveLength(1);
          expect(ownerListed[0]?.id).toBe(ownerAsset.id);
          expect(otherListed).toHaveLength(1);
          expect(otherListed[0]?.id).toBe(otherAsset.id);

          expect(await forgetAssets(owner, [otherAsset.id])).toBe(0);
          expect(await listAssets(other, jobId)).toHaveLength(1);

          const byIds = await listAssetsForGatewayRequestIds(owner, [
            jobId,
            "missing",
          ]);
          expect(byIds.map((asset) => asset.id)).toEqual([ownerAsset.id]);
          const batch = Array.from({ length: 130 }, (_, i) => ({
            id: `batch_${stamp}_${i}`,
            principalId: owner,
            url: `https://example.test/${i}.png`,
            capability: "synthetic",
            gatewayRequestId: `batch_job_${i}`,
          }));
          await getDb().insert(schema.mcpAssets).values(batch);
          const all = await listAssetsForGatewayRequestIds(
            owner,
            batch.map((row) => row.gatewayRequestId)
          );
          expect(all).toHaveLength(130);
          expect(
            await listAssetsForGatewayRequestIds(
              other,
              batch.map((row) => row.gatewayRequestId)
            )
          ).toEqual([]);
          expect(
            await forgetAssets(
              owner,
              batch.map((row) => row.id)
            )
          ).toBe(130);

          expect(await forgetAssets(owner, [ownerAsset.id])).toBe(1);
          expect(await listAssets(owner, jobId)).toEqual([]);
          expect(await listAssets(other, jobId)).toHaveLength(1);
          await forgetAssets(other);
          throw rollback;
        })
      ).rejects.toBe(rollback);
    }, 60000);
  }
);
