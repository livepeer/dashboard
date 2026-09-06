import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { externalAccounts } from "./external-accounts";
import type { CapturedResult, JsonValue, RunQueue } from "@/lib/runs/types";

export const runStatus = pgEnum("run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
]);

/** Durable execution metadata, independent of provider media lifetime.
 * Payload fields accept reviewed/redacted JSON only, never raw credentials.
 * This model does not itself enable collection in the execution handler. */
export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    externalAccountId: uuid("external_account_id")
      .notNull()
      .references(() => externalAccounts.id, { onDelete: "restrict" }),
    gatewayRequestId: text("gateway_request_id").notNull(),
    providerRequestId: text("provider_request_id"),
    provider: text("provider"),
    source: text("source").notNull(),
    capability: text("capability").notNull(),
    modelId: text("model_id"),
    endpoint: text("endpoint"),
    status: runStatus("status").default("queued").notNull(),
    // Null means not captured, not an empty argument list or successful result.
    submittedArguments: jsonb("submitted_arguments").$type<
      Record<string, JsonValue>
    >(),
    result: jsonb("result").$type<CapturedResult>(),
    captureRedactedPaths: jsonb("capture_redacted_paths")
      .$type<string[]>()
      .default([])
      .notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    captureVersion: integer("capture_version").default(1).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runs_principal_gateway_unique").on(
      table.principalId,
      table.gatewayRequestId
    ),
    uniqueIndex("runs_asset_owner_unique").on(
      table.id,
      table.principalId,
      table.gatewayRequestId
    ),
    index("runs_principal_created_idx").on(
      table.principalId,
      table.createdAt.desc(),
      table.id
    ),
    index("runs_created_idx").on(table.createdAt.desc(), table.id),
    index("runs_status_updated_idx").on(table.status, table.updatedAt),
    index("runs_user_created_idx").on(table.userId, table.createdAt.desc()),
    check(
      "runs_source_check",
      sql`${table.source} in ('mcp', 'console', 'api', 'gateway')`
    ),
    check(
      "runs_version_check",
      sql`${table.version} > 0 and ${table.captureVersion} > 0`
    ),
    check(
      "runs_arguments_object_check",
      sql`${table.submittedArguments} is null or jsonb_typeof(${table.submittedArguments}) = 'object'`
    ),
    check(
      "runs_result_object_check",
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    check(
      "runs_completion_check",
      sql`(${table.status} in ('succeeded', 'failed', 'cancelled')) = (${table.completedAt} is not null)`
    ),
    check(
      "runs_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt} and (${table.startedAt} is null or ${table.startedAt} >= ${table.createdAt}) and (${table.completedAt} is null or ${table.completedAt} >= coalesce(${table.startedAt}, ${table.createdAt}))`
    ),
  ]
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    eventKey: text("event_key").notNull(),
    status: runStatus("status").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, JsonValue>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("run_events_key_unique").on(table.runId, table.eventKey),
    index("run_events_run_created_idx").on(table.runId, table.createdAt),
  ]
);

export const runReconciliationJobs = pgTable(
  "run_reconciliation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    queue: jsonb("queue").$type<RunQueue>().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    leaseToken: uuid("lease_token"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastReason: text("last_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("run_reconciliation_run_unique").on(table.runId),
    index("run_reconciliation_available_idx").on(table.availableAt),
    check("run_reconciliation_attempts_check", sql`${table.attempts} >= 0`),
  ]
);

export const runReadAudits = pgTable(
  "run_read_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    adminGrantId: uuid("admin_grant_id").notNull(),
    action: text("action").notNull(),
    runId: text("run_id").references(() => runs.id, { onDelete: "restrict" }),
    resultCount: integer("result_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("run_read_audits_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    check(
      "run_read_audits_action_check",
      sql`${table.action} in ('list', 'detail')`
    ),
  ]
);
