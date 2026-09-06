import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { adminRoleGrants } from "./admin";
import { waitlistSignups } from "./waitlist";

export const accessGrantStatus = pgEnum("access_grant_status", [
  "approved",
  "revoked",
]);
// Administrative authority has a separate domain from product admission.

export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    signupId: uuid("signup_id").references(() => waitlistSignups.id, {
      onDelete: "restrict",
    }),
    status: accessGrantStatus("status").notNull(),
    source: text("source").notNull(),
    version: integer("version").default(1).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("access_grants_user_idx")
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("access_grants_signup_idx")
      .on(table.signupId)
      .where(sql`${table.signupId} is not null`),
    index("access_grants_status_idx").on(table.status),
    check(
      "access_grants_target_check",
      sql`${table.userId} is not null or ${table.signupId} is not null`
    ),
    check("access_grants_version_check", sql`${table.version} > 0`),
  ]
);

export const accessOperations = pgTable(
  "access_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorAdminGrantId: uuid("actor_admin_grant_id")
      .notNull()
      .references(() => adminRoleGrants.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("access_operations_actor_request_idx").on(
      table.actorAdminGrantId,
      table.requestId
    ),
    check(
      "access_operations_action_check",
      sql`${table.action} in ('approve', 'revoke')`
    ),
  ]
);

export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => accessGrants.id, { onDelete: "restrict" }),
    actorAdminGrantId: uuid("actor_admin_grant_id").references(
      () => adminRoleGrants.id,
      { onDelete: "restrict" }
    ),
    operationId: uuid("operation_id").references(() => accessOperations.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    source: text("source").notNull(),
    previousStatus: accessGrantStatus("previous_status"),
    nextStatus: accessGrantStatus("next_status").notNull(),
    grantVersion: integer("grant_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("access_events_operation_grant_idx").on(
      table.operationId,
      table.grantId
    ),
    uniqueIndex("access_events_grant_version_idx").on(
      table.grantId,
      table.grantVersion
    ),
    check(
      "access_events_action_check",
      sql`${table.action} in ('approve', 'revoke', 'activate', 'grandfather')`
    ),
    check("access_events_version_check", sql`${table.grantVersion} > 0`),
  ]
);

export const accessOperationItems = pgTable(
  "access_operation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => accessOperations.id, { onDelete: "restrict" }),
    signupId: uuid("signup_id")
      .notNull()
      .references(() => waitlistSignups.id, { onDelete: "restrict" }),
    outcome: text("outcome").notNull(),
    code: text("code"),
    eventId: uuid("event_id").references(() => accessEvents.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("access_operation_items_operation_signup_idx").on(
      table.operationId,
      table.signupId
    ),
    check(
      "access_operation_items_outcome_check",
      sql`${table.outcome} in ('approved', 'revoked', 'unchanged', 'ineligible', 'failed')`
    ),
  ]
);
