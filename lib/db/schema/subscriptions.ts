import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { waitlistSignups } from "./waitlist";

export const emailSubscriptionStatus = pgEnum("email_subscription_status", [
  "subscribed",
  "unsubscribed",
]);
export const emailSubscriptions = pgTable(
  "email_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    normalizedEmail: text("normalized_email").notNull(),
    purpose: text("purpose").notNull(),
    status: emailSubscriptionStatus("status").default("unsubscribed").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    signupId: uuid("signup_id").references(
      (): AnyPgColumn => waitlistSignups.id,
      { onDelete: "set null" }
    ),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_subscriptions_address_purpose_idx").on(
      table.normalizedEmail,
      table.purpose
    ),
    index("email_subscriptions_user_idx").on(table.userId),
    index("email_subscriptions_signup_idx").on(table.signupId),
  ]
);
