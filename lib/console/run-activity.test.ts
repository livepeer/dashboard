import assert from "node:assert/strict";
import { test } from "node:test";

import {
  feeFieldsFromRunEvents,
  runToActivity,
} from "./run-activity";
import type { RunDetail, RunSummary } from "@/lib/runs/types";

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run_1",
    principalId: "external",
    userId: "user",
    externalAccountId: "account",
    gatewayRequestId: "job_abc",
    providerRequestId: null,
    provider: null,
    source: "mcp",
    capability: "livepeer-example/fal-ideogram-v4",
    modelId: "livepeer-example/fal-ideogram-v4",
    endpoint: null,
    status: "succeeded",
    captureVersion: 1,
    errorCode: null,
    errorMessage: null,
    version: 1,
    createdAt: "2026-09-08T18:00:00Z",
    updatedAt: "2026-09-08T18:00:01Z",
    startedAt: "2026-09-08T18:00:00Z",
    completedAt: "2026-09-08T18:00:01Z",
    email: null,
    ...overrides,
  };
}

test("run history stays em-dash when no billing receipt is joined", () => {
  const row = runToActivity(summary());
  assert.equal(row.costDisplay, "—");
  assert.equal(row.costExact, undefined);
});

test("run history uses the signed-ticket fee mapper", () => {
  const row = runToActivity(summary(), { networkFeeUsdMicros: "1000" });
  assert.equal(row.costDisplay, "$0.0010");
  assert.equal(row.costExact, "$0.001");
});

test("run detail does not take Cost from Postgres run events", () => {
  const detail = {
    ...summary(),
    submittedArguments: null,
    result: null,
    captureRedactedPaths: [],
    assets: [],
    events: [
      {
        id: "evt_old",
        eventKey: "usage:old",
        status: "succeeded" as const,
        createdAt: "2026-09-08T18:00:00Z",
        metadata: { kind: "billing_usage", networkFeeUsdMicros: "500" },
      },
      {
        id: "evt_new",
        eventKey: "usage:new",
        status: "succeeded" as const,
        createdAt: "2026-09-08T18:00:02Z",
        metadata: { kind: "billing_usage", networkFeeUsdMicros: "2500" },
      },
    ],
  } satisfies RunDetail;
  const fields = feeFieldsFromRunEvents(detail.events);
  assert.equal(fields?.networkFeeUsdMicros, "2500");
  const row = runToActivity(detail);
  assert.equal(row.costDisplay, "—");
});
