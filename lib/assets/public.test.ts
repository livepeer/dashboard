import assert from "node:assert/strict";
import { test } from "node:test";
import { publicAssetUrl, publicRunDetail } from "./public";
import type { RunDetail } from "@/lib/runs/types";

test("gives every asset a canonical first-party URL and rewrites captured outputs", () => {
  const source = "https://v3b.fal.media/files/output.mp4";
  const detail = {
    assets: [
      {
        id: "asset_123",
        url: source,
        mediaType: "video",
        providerRequestId: "provider-request",
        availableUntil: null,
        expiresAt: null,
        unavailableAt: null,
        hiddenAt: null,
        createdAt: "2026-09-09T12:00:00.000Z",
      },
    ],
    result: { value: { video_urls: [source], note: "done" } },
  } as unknown as RunDetail;

  const result = publicRunDetail(detail);
  assert.equal(result.assets[0]?.url, publicAssetUrl("asset_123"));
  assert.deepEqual(result.result?.value, {
    video_urls: [publicAssetUrl("asset_123")],
    note: "done",
  });
  assert.doesNotMatch(JSON.stringify(result), /fal\.media/);
});
