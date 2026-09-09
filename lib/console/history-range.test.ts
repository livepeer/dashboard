import assert from "node:assert/strict";
import { test } from "node:test";
import { HISTORY_MAX_DAYS, historyRange } from "./history-range";

test("history is a 365-day lookback, not an epoch start", () => {
  for (const date of ["2026-09-05T12:00:00.000Z", "2027-09-05T12:00:00.000Z"]) {
    const now = new Date(date);
    const range = historyRange(now);
    const expectedFrom = new Date(now.getTime());
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - (HISTORY_MAX_DAYS - 1));
    assert.deepEqual(range, {
      from: expectedFrom.toISOString(),
      to: now.toISOString(),
    });
    assert.notEqual(range.from, "1970-01-01T00:00:00.000Z");
  }
});
