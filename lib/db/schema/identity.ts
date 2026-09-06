import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: userStatus("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [index("users_status_idx").on(table.status)]
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authority: text("authority").default("auth0").notNull(),
    // Null marks legacy identity records requiring explicit issuer reconciliation.
    issuer: text("issuer"),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    externalUserId: text("external_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_identities_authority_issuer_subject_idx")
      .on(table.authority, table.issuer, table.providerSubject)
      .where(sql`${table.issuer} is not null`),
    uniqueIndex("auth_identities_legacy_provider_subject_idx")
      .on(table.provider, table.providerSubject)
      .where(sql`${table.issuer} is null`),
    uniqueIndex("auth_identities_external_user_id_idx").on(
      table.externalUserId
    ),
    index("auth_identities_user_idx").on(table.userId),
  ]
);

export const userEmails = pgTable(
  "user_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    source: text("source").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_emails_user_normalized_idx").on(
      table.userId,
      table.normalizedEmail
    ),
    uniqueIndex("user_emails_verified_normalized_idx")
      .on(table.normalizedEmail)
      .where(sql`${table.verifiedAt} is not null`),
    uniqueIndex("user_emails_primary_user_idx")
      .on(table.userId)
      .where(sql`${table.isPrimary} = true`),
  ]
);
