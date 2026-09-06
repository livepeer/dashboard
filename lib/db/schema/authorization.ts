import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Single-use receipts only. Never persist raw OAuth authorization codes. */
export const oauthCodeRedemptions = pgTable("oauth_code_redemptions", {
  codeHash: text("code_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
