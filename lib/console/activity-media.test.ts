import assert from "node:assert/strict";
import { test } from "node:test";

import { mediaSpecForRow } from "./activity-media";
import { mapSignedTicketToActivityRow } from "./signed-ticket-activity";

const ticket = {
  time: "2026-09-04T22:17:00.000Z",
  clientId: "app_test",
  appName: "Livepeer Agent",
  externalUserId: "eu_test",
  gatewayRequestId: "job_abc",
  pipeline: "fixed",
  modelId: "livepeer-example/fal-gpt-image-2",
  networkFeeUsdMicros: "1000",
  eventId: "evt_1",
};

test("signed-ticket join copies output URL and provider request id", () => {
  const row = mapSignedTicketToActivityRow({
    ...ticket,
    outputUrl: "https://v3b.fal.media/files/x.jpg",
    providerRequestId: "req-fal",
  });
  assert.equal(row.id, "usage:evt_1");
  assert.equal(row.gatewayRequestId, "job_abc");
  assert.equal(row.status, "unknown");
  assert.equal(row.outputUrl, "https://v3b.fal.media/files/x.jpg");
  assert.equal(row.providerRequestId, "req-fal");
});

test("media spec uses the stored image URL, not a placeholder", () => {
  const spec = mediaSpecForRow(
    mapSignedTicketToActivityRow({
      ...ticket,
      outputUrl: "https://v3b.fal.media/files/x.jpg",
    })
  );
  assert.equal(spec.kind, "image");
  assert.equal(spec.imageUrl, "https://v3b.fal.media/files/x.jpg");
  assert.equal(spec.format, "JPG");
  assert.equal(spec.imageUrl?.includes("picsum"), false);
});

test("media spec plays stored video URLs", () => {
  const spec = mediaSpecForRow(
    mapSignedTicketToActivityRow({
      ...ticket,
      pipeline: "text-to-video",
      modelId: "livepeer-example/fal-ltx-25-t2v-fast",
      outputUrl: "https://v3b.fal.media/files/out.mp4",
    })
  );
  assert.equal(spec.kind, "video");
  assert.equal(spec.videoUrl, "https://v3b.fal.media/files/out.mp4");
});

test("media spec does not invent a preview when the job has no stored output", () => {
  const spec = mediaSpecForRow(mapSignedTicketToActivityRow(ticket));
  assert.equal(spec.kind, "image");
  assert.equal(spec.imageUrl, undefined);
  assert.equal(spec.metricValue, "Not stored");
});

test("text modalities are not classified as video because the pipeline name contains video", () => {
  const spec = mediaSpecForRow(
    mapSignedTicketToActivityRow({
      ...ticket,
      pipeline: "video-understanding",
      modelId: "livepeer-example/fal-video-understand",
      outputUrl: "https://example.test/notes.txt",
    })
  );
  assert.equal(spec.kind, "text");
  assert.equal(spec.videoUrl, undefined);
  assert.equal(spec.text, "https://example.test/notes.txt");
});
