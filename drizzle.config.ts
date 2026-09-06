import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  // Original drizzle/ is immutable upgrade evidence, not the generation target.
  out: "./drizzle-baseline",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/waitlist",
  },
});
