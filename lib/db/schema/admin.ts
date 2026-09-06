import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { waitlistSignups } from "./waitlist";

export const adminRoleGrants = pgTable(
  "admin_role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signupId: uuid("signup_id")
      .notNull()
      .references(() => waitlistSignups.id, { onDelete: "restrict" }),
    role: text("role").default("admin").notNull(),
    source: text("source").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("admin_role_grants_signup_role_idx").on(
      table.signupId,
      table.role
    ),
    check("admin_role_grants_role_check", sql`${table.role} = 'admin'`),
  ]
);
