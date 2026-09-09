import assert from "node:assert/strict";
import { test } from "node:test";

import { matchRunTicketFees, matchTicketOutputs } from "./activity-output-match";
import type { SignedTicketRequestRow } from "./account-usage";

function ticket(
  partial: Partial<SignedTicketRequestRow> &
    Pick<SignedTicketRequestRow, "gatewayRequestId" | "time" | "modelId">
): SignedTicketRequestRow {
  return {
    clientId: "app_test",
    externalUserId: "eu_3ebf",
    networkFeeUsdMicros: "1000",
    eventId: partial.eventId ?? partial.gatewayRequestId,
    pipeline: "fixed",
    ...partial,
  };
}

test("exact gateway_request_id wins over time matching", () => {
  const items = [
    ticket({
      gatewayRequestId: "job_abc",
      time: "2026-09-05T01:37:43.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_wrong",
      url: "https://example.test/wrong.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:40.000Z",
      gatewayRequestId: "job_other",
    },
    {
      id: "asset_hit",
      url: "https://example.test/hit.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:00:00.000Z",
      gatewayRequestId: "job_abc",
      providerRequestId: "req-fal",
    },
  ]);
  assert.equal(matched.get("job_abc")?.url, "https://example.test/hit.jpg");
  assert.equal(matched.get("job_abc")?.providerRequestId, "req-fal");
});

test("orchestrator 8-hex tickets join MCP job_* assets by capability and time", () => {
  const items = [
    ticket({
      gatewayRequestId: "41dfff3c",
      eventId: "41dfff3c",
      time: "2026-09-05T01:37:50.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_1",
      url: "https://v3b.fal.media/files/b/cube.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:43.000Z",
      gatewayRequestId: "job_44480a5ff910483e",
      providerRequestId: "01a06f36-d5fe-7351-a8d1-ce8fa3c11004",
    },
  ]);
  assert.equal(
    matched.get("41dfff3c")?.url,
    "https://v3b.fal.media/files/b/cube.jpg"
  );
});

test("time match does not attach a different capability", () => {
  const items = [
    ticket({
      gatewayRequestId: "83493a58",
      time: "2026-09-05T01:37:50.000Z",
      modelId: "livepeer-example/fal-ltx-25-t2v-fast",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_1",
      url: "https://example.test/flux.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:43.000Z",
      gatewayRequestId: "job_44480a5ff910483e",
    },
  ]);
  assert.equal(matched.has("83493a58"), false);
});

test("each asset attaches to at most one ticket", () => {
  const items = [
    ticket({
      gatewayRequestId: "aaaa1111",
      time: "2026-09-05T01:37:50.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
    ticket({
      gatewayRequestId: "bbbb2222",
      time: "2026-09-05T01:37:51.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_1",
      url: "https://example.test/only.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:43.000Z",
      gatewayRequestId: "job_one",
    },
  ]);
  assert.equal(matched.size, 1);
});

test("ambiguous same-capability assets in the window are not attached", () => {
  const items = [
    ticket({
      gatewayRequestId: "aaaa1111",
      time: "2026-09-05T01:37:50.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_a",
      url: "https://example.test/a.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:43.000Z",
      gatewayRequestId: "job_a",
    },
    {
      id: "asset_b",
      url: "https://example.test/b.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:40.000Z",
      gatewayRequestId: "job_b",
    },
  ]);
  assert.equal(matched.has("aaaa1111"), false);
});

test("job_* tickets without an exact id match do not fuzzy-join another job", () => {
  const items = [
    ticket({
      gatewayRequestId: "job_abc",
      time: "2026-09-05T01:37:50.000Z",
      modelId: "livepeer-example/fal-flux-schnell",
    }),
  ];
  const matched = matchTicketOutputs(items, [
    {
      id: "asset_other",
      url: "https://example.test/other.jpg",
      capability: "livepeer-example/fal-flux-schnell",
      createdAt: "2026-09-05T01:37:43.000Z",
      gatewayRequestId: "job_other",
    },
  ]);
  assert.equal(matched.has("job_abc"), false);
});

test("exact ticket id still prices a run", () => {
  const fees = matchRunTicketFees(
    [
      {
        gatewayRequestId: "job_saved",
        capability: "livepeer-example/fal-flux-schnell",
        createdAt: "2026-09-09T21:09:30.000Z",
      },
    ],
    [
      {
        gatewayRequestId: "job_saved",
        modelId: "livepeer-example/fal-flux-schnell",
        time: "2026-09-09T21:09:30.000Z",
        costDisplay: "$0.0030",
        costExact: "$0.002999",
      },
    ]
  );
  assert.equal(fees.get("job_saved")?.costDisplay, "$0.0030");
});

test("orchestrator 8-hex tickets price MCP job_* runs by capability and nearest time", () => {
  const fees = matchRunTicketFees(
    [
      {
        gatewayRequestId: "job_b6edf64e2a2442da",
        capability: "livepeer-example/fal-flux-schnell",
        createdAt: "2026-09-09T21:09:28.000Z",
      },
      {
        gatewayRequestId: "job_later",
        capability: "livepeer-example/fal-flux-schnell",
        createdAt: "2026-09-09T21:15:16.000Z",
      },
    ],
    [
      {
        gatewayRequestId: "5b66062c",
        modelId: "livepeer-example/fal-flux-schnell",
        time: "2026-09-09T21:09:30.000Z",
        costDisplay: "$0.0030",
      },
      {
        gatewayRequestId: "55d0075d",
        modelId: "livepeer-example/fal-flux-schnell",
        time: "2026-09-09T21:15:16.000Z",
        costDisplay: "$0.0030",
      },
    ]
  );
  assert.equal(fees.get("job_b6edf64e2a2442da")?.costDisplay, "$0.0030");
  assert.equal(fees.get("job_later")?.costDisplay, "$0.0030");
});

test("8-hex tickets do not price a different capability", () => {
  const fees = matchRunTicketFees(
    [
      {
        gatewayRequestId: "job_video",
        capability: "livepeer-example/fal-ltx-25-t2v-fast",
        createdAt: "2026-09-09T21:09:30.000Z",
      },
    ],
    [
      {
        gatewayRequestId: "5b66062c",
        modelId: "livepeer-example/fal-flux-schnell",
        time: "2026-09-09T21:09:30.000Z",
        costDisplay: "$0.0030",
      },
    ]
  );
  assert.equal(fees.has("job_video"), false);
});
