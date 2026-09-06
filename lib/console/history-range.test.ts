import assert from "node:assert/strict";
import { test } from "node:test";
import { historyRange } from "./history-range";

test("history starts at a fixed all-time boundary, not a rolling cutoff", () => {
  for (const date of ["2026-09-05", "2027-09-05"]) {
    const now = new Date(date);
    assert.deepEqual(historyRange(now), {
      from: "1970-01-01T00:00:00.000Z",
      to: now.toISOString(),
    });
  }
});
