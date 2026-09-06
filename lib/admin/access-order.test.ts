import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

vi.mock("server-only", () => ({}));
const { queries } = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    drizzle(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: sql.startsWith("select count(*)") ? [[0]] : [] };
    }),
}));

import {
  freezeAccessSelection,
  listAccessEntries,
  parseAccessFilters,
} from "./access";

describe("Console Access ordering", () => {
  it.each([
    "waiting",
    "approved",
    "revoked",
    "subscribed",
    "unverified",
    "all",
  ])(
    "sorts %s newest first before pagination and uses the same order for select all",
    async (state) => {
      queries.length = 0;
      const filters = parseAccessFilters(
        new URLSearchParams({
          state,
          page: "2",
          pageSize: "2",
          search: "example",
        })
      );
      await listAccessEntries(filters);
      await freezeAccessSelection(filters);
      const ordered = queries.filter(({ sql }) => sql.includes("order by"));
      expect(ordered).toHaveLength(2);
      for (const { sql } of ordered) {
        // Preserve the existing unverified-last grouping and stable ID tie-break.
        expect(sql).toContain(
          'order by case when "waitlist_signups"."confirmed_at" is null then 1 else 0 end asc, "waitlist_signups"."first_seen_at" desc, "waitlist_signups"."id" asc'
        );
      }
      expect(ordered[0].sql).toMatch(/order by .* limit \$\d+ offset \$\d+$/);
      expect(ordered[0].params.slice(-2)).toEqual([2, 2]);
      expect(ordered[1].sql).not.toContain(" limit ");
    }
  );
});
