import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authIdentities, users } from "./identity";

export const externalAccounts = pgTable(
  "external_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    service: text("service").notNull(),
    issuer: text("issuer").notNull(),
    appId: text("app_id").notNull(),
    externalUserId: text("external_user_id").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("external_accounts_scope_external_idx").on(
      table.service,
      table.issuer,
      table.appId,
      table.externalUserId
    ),
    index("external_accounts_user_scope_idx").on(
      table.userId,
      table.service,
      table.issuer,
      table.appId
    ),
  ]
);

export const identityExternalAccounts = pgTable(
  "identity_external_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "restrict" }),
    externalAccountId: uuid("external_account_id")
      .notNull()
      .references(() => externalAccounts.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("identity_external_accounts_binding_idx").on(
      table.identityId,
      table.externalAccountId
    ),
    index("identity_external_accounts_account_idx").on(table.externalAccountId),
  ]
);
