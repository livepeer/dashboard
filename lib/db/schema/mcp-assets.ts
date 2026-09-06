import {
  index,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { runs } from "./runs";

/** MCP-produced media URLs, scoped per console/MCP principal (`eu_…`). */
export const mcpAssets = pgTable(
  "mcp_assets",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id").notNull(),
    url: text("url").notNull(),
    capability: text("capability").notNull(),
    gatewayRequestId: text("gateway_request_id").notNull(),
    providerRequestId: text("provider_request_id"),
    // Nullable for existing references and writers not yet capturing runs.
    runId: text("run_id"),
    mediaType: text("media_type"),
    // A provider guarantee is not an exact expiry. Neither deletes this row.
    availableUntil: timestamp("available_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "mcp_assets_run_owner_fk",
      columns: [table.runId, table.principalId, table.gatewayRequestId],
      foreignColumns: [runs.id, runs.principalId, runs.gatewayRequestId],
    }).onDelete("restrict"),
    index("mcp_assets_run_idx").on(table.runId),
    uniqueIndex("mcp_assets_principal_job_url_unique").on(
      table.principalId,
      table.gatewayRequestId,
      table.url
    ),
    index("mcp_assets_principal_created_idx").on(
      table.principalId,
      table.createdAt.desc()
    ),
    index("mcp_assets_principal_capability_idx").on(
      table.principalId,
      table.capability
    ),
  ]
);
