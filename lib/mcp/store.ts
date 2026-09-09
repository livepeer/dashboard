import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { mcpAssets } from "@/lib/db/schema";
import { publicAssetUrl } from "@/lib/assets/public";

export type Asset = {
  id: string;
  url: string;
  capability: string;
  createdAt: string;
  /** Joins this asset to its ticket rows in PymtHouse metering. */
  gatewayRequestId: string;
  providerRequestId?: string | null;
};

export const ASSET_STORE_UNAVAILABLE = "asset_store_unavailable";
export const GATEWAY_ID_QUERY_CHUNK = 100;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function assetStoreConfigured(
  source: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(source.DATABASE_URL?.trim());
}

export function chunkIds(
  ids: string[],
  size = GATEWAY_ID_QUERY_CHUNK
): string[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError("Invalid chunk size");
  const unique = [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

/** Escape `%`, `_`, and `\` so ILIKE is a literal substring match. */
export function likeSubstring(query: string): string {
  return query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function publicAssetStoreError(): {
  error: string;
  message: string;
} {
  return {
    error: ASSET_STORE_UNAVAILABLE,
    message: "Could not access persisted assets.",
  };
}

export function logAssetStoreError(err: unknown): void {
  const rec =
    err && typeof err === "object"
      ? (err as { name?: unknown; code?: unknown })
      : null;
  console.error(
    JSON.stringify({
      msg: "mcp.assets",
      name: rec && typeof rec.name === "string" ? rec.name : "Error",
      code: rec && typeof rec.code === "string" ? rec.code : undefined,
    })
  );
}

export function mapAssetRow(row: {
  id: string;
  url: string;
  capability: string;
  gatewayRequestId: string;
  providerRequestId: string | null;
  createdAt: Date | string;
}): Asset {
  return {
    id: row.id,
    url: row.url,
    capability: row.capability,
    createdAt: asIso(row.createdAt),
    gatewayRequestId: row.gatewayRequestId,
    providerRequestId: row.providerRequestId,
  };
}

export function serializeAsset(asset: Asset) {
  return {
    id: asset.id,
    url: publicAssetUrl(asset.id),
    capability: asset.capability,
    created_at: asset.createdAt,
    gateway_request_id: asset.gatewayRequestId,
    provider_request_id: asset.providerRequestId ?? null,
  };
}

export async function getAssetSource(id: string): Promise<{
  url: string;
  mediaType: string | null;
} | null> {
  const [row] = await getDb()
    .select({ url: mcpAssets.url, mediaType: mcpAssets.mediaType })
    .from(mcpAssets)
    .where(eq(mcpAssets.id, id))
    .limit(1);
  return row ?? null;
}

export async function rememberAsset(
  principalId: string,
  asset: Asset
): Promise<Asset> {
  const rows = await getDb()
    .insert(mcpAssets)
    .values({
      id: asset.id,
      principalId,
      url: asset.url,
      capability: asset.capability,
      gatewayRequestId: asset.gatewayRequestId,
      providerRequestId: asset.providerRequestId ?? null,
    })
    .onConflictDoUpdate({
      target: [
        mcpAssets.principalId,
        mcpAssets.gatewayRequestId,
        mcpAssets.url,
      ],
      set: {
        capability: sql`excluded.capability`,
        providerRequestId: sql`coalesce(excluded.provider_request_id, ${mcpAssets.providerRequestId})`,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("mcp_assets insert returned no row");
  }
  return mapAssetRow(row);
}

export async function listAssets(
  principalId: string,
  query?: string,
  limit?: number
): Promise<Asset[]> {
  const filters = [
    eq(mcpAssets.principalId, principalId),
    isNull(mcpAssets.hiddenAt),
  ];
  const trimmed = query?.trim();
  if (trimmed) {
    const pattern = `%${likeSubstring(trimmed)}%`;
    filters.push(
      or(
        sql`${mcpAssets.capability} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${mcpAssets.url} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${mcpAssets.gatewayRequestId} ILIKE ${pattern} ESCAPE '\\'`
      )!
    );
  }
  const rows = await getDb()
    .select()
    .from(mcpAssets)
    .where(and(...filters))
    .orderBy(desc(mcpAssets.createdAt))
    .limit(clampLimit(limit));
  return rows.map(mapAssetRow);
}

export async function listAssetsForGatewayRequestIds(
  principalId: string,
  gatewayRequestIds: string[]
): Promise<Asset[]> {
  const chunks = chunkIds(gatewayRequestIds);
  if (chunks.length === 0) return [];
  const db = getDb();
  const batches = await Promise.all(
    chunks.map((ids) =>
      db
        .select()
        .from(mcpAssets)
        .where(
          and(
            eq(mcpAssets.principalId, principalId),
            inArray(mcpAssets.gatewayRequestId, ids)
          )
        )
        .orderBy(desc(mcpAssets.createdAt))
    )
  );
  return batches.flat().map(mapAssetRow);
}

export async function forgetAssets(
  principalId: string,
  ids?: string[]
): Promise<number> {
  const db = getDb();
  if (ids === undefined) {
    const rows = await db
      .update(mcpAssets)
      .set({ hiddenAt: new Date() })
      .where(
        and(eq(mcpAssets.principalId, principalId), isNull(mcpAssets.hiddenAt))
      )
      .returning({ id: mcpAssets.id });
    return rows.length;
  }
  const keep = ids.filter((id) => id.trim());
  if (keep.length === 0) return 0;
  const rows = await db
    .update(mcpAssets)
    .set({ hiddenAt: new Date() })
    .where(
      and(
        eq(mcpAssets.principalId, principalId),
        isNull(mcpAssets.hiddenAt),
        inArray(mcpAssets.id, keep)
      )
    )
    .returning({ id: mcpAssets.id });
  return rows.length;
}
