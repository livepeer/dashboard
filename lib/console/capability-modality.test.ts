import assert from "node:assert/strict";
import { test } from "node:test";

import { FAL_CAPABILITY_CATALOG } from "../mcp/fal-capability-catalog";
import { mapSignedTicketToActivityRow } from "./signed-ticket-activity";
import { humanizePipelineModel } from "./usage-capability-display";
import {
  capabilityPresentation,
  outputKindForModality,
  pipelineForModality,
  resolveActivityCapability,
  resolveCapabilityModality,
} from "./capability-modality";

test("capability presentation pulls modality out of titles", () => {
  assert.deepEqual(capabilityPresentation("Kling Image to Video", "i2v"), {
    title: "Kling",
    modality: "Image to video",
  });
  assert.deepEqual(capabilityPresentation("Flux Schnell", "t2i"), {
    title: "Flux Schnell",
    modality: "Text to image",
  });
  assert.deepEqual(capabilityPresentation("Custom i2v", "i2v"), {
    title: "Custom",
    modality: "Image to video",
  });
  assert.deepEqual(capabilityPresentation("Kling image-to-video Pro", "i2v"), {
    title: "Kling Pro",
    modality: "Image to video",
  });
});

test("model display names omit catalog and provider namespaces", () => {
  assert.equal(
    humanizePipelineModel("fixed", "livepeer-example/fal-whisper-transcribe"),
    "Whisper Transcribe"
  );
  assert.equal(
    humanizePipelineModel("fixed", "fal-ai/kling-video-v2.1-master"),
    "Kling Video V2 1 Master"
  );
  assert.equal(
    humanizePipelineModel("text-to-image", "flux-schnell"),
    "Flux Schnell"
  );
});

test("first-party pipeline names map to modality tags", () => {
  assert.equal(resolveCapabilityModality({ pipeline: "text-to-image" }), "t2i");
  assert.equal(
    resolveCapabilityModality({ pipeline: "image-to-video" }),
    "i2v"
  );
  assert.equal(
    resolveCapabilityModality({ pipeline: "live-video-to-video" }),
    "v2v"
  );
  assert.equal(
    resolveCapabilityModality({ pipeline: "text-generation" }),
    "text"
  );
});

test("price units are not treated as pipelines", () => {
  assert.equal(resolveCapabilityModality({ pipeline: "fixed" }), null);
  assert.equal(resolveCapabilityModality({ pipeline: "hour" }), null);
});

test("unresolved batch tickets stay unknown, not live video", () => {
  const unresolved = resolveActivityCapability({ pipeline: "fixed" });
  assert.equal(unresolved.modality, "unknown");
  assert.equal(unresolved.pipeline, "unknown");
  assert.equal(outputKindForModality("unknown"), "json");
  assert.equal(
    resolveActivityCapability({
      pipeline: "fixed",
      capabilityId: "livepeer-example/brand-new-batch-app",
    }).modality,
    "unknown"
  );
});

test("persistent live jobs without a media modality are realtime", () => {
  assert.equal(
    resolveActivityCapability({
      pipeline: "hour",
      capabilityId: "livepeer-example/comfyui-stream",
    }).modality,
    "realtime"
  );
  assert.equal(resolveCapabilityModality({ pipeline: "live" }), "realtime");
  assert.equal(
    resolveActivityCapability({ pipeline: "hour" }).pipeline,
    "live-video-to-video"
  );
  assert.equal(outputKindForModality("realtime"), "video");
});

test("live-runner app ids infer modality from fal endpoint metadata", () => {
  assert.equal(
    resolveCapabilityModality({
      pipeline: "fixed",
      capabilityId: "livepeer-example/fal-gpt-image-2",
    }),
    "t2i"
  );
  assert.equal(
    resolveCapabilityModality({
      pipeline: "fixed",
      capabilityId: "livepeer-example/fal-gpt-image-2-edit",
    }),
    "edit"
  );
  assert.equal(
    resolveCapabilityModality({
      pipeline: "fixed",
      capabilityId: "livepeer-example/fal-flux-3-i2v",
    }),
    "i2v"
  );
  assert.equal(
    resolveCapabilityModality({
      pipeline: "fixed",
      capabilityId: "livepeer-example/fal-whisper-transcribe",
    }),
    "asr"
  );
  assert.equal(
    resolveCapabilityModality({
      pipeline: "fixed",
      capabilityId: "livepeer-example/fal-gemini-tts",
    }),
    "tts"
  );
});

test("inferred modality restores a first-party pipeline for previews", () => {
  const resolved = resolveActivityCapability({
    pipeline: "fixed",
    capabilityId: "livepeer-example/fal-gpt-image-2",
  });
  assert.equal(resolved.modality, "t2i");
  assert.equal(resolved.pipeline, "text-to-image");
  assert.equal(pipelineForModality("t2i"), "text-to-image");
  assert.equal(outputKindForModality("t2i"), "image");
  assert.equal(outputKindForModality("i2v"), "video");
  assert.equal(outputKindForModality("tts"), "audio");
});

test("every fal catalog app resolves to a modality", () => {
  const missing = FAL_CAPABILITY_CATALOG.filter(
    (entry) => resolveCapabilityModality({ capabilityId: entry.name }) == null
  ).map((entry) => entry.name);
  assert.deepEqual(missing, []);
});

test("signed-ticket rows with price-unit pipelines surface modality, not f", () => {
  const row = mapSignedTicketToActivityRow({
    time: "2026-09-04T22:17:00.000Z",
    clientId: "app_test",
    appName: "Livepeer Agent",
    externalUserId: "eu_test",
    gatewayRequestId: "1469f5d0",
    pipeline: "fixed",
    modelId: "livepeer-example/fal-gpt-image-2",
    networkFeeUsdMicros: "1000",
    eventId: "evt_1",
  });
  assert.equal(row.modality, "t2i");
  assert.equal(row.pipeline, "text-to-image");
  assert.equal(row.signerLabel, "Livepeer Agent");
  assert.equal(row.costDisplay, "$0.0010");
});

test("signed-ticket rows without a media modality are realtime live jobs", () => {
  const row = mapSignedTicketToActivityRow({
    time: "2026-09-04T22:17:00.000Z",
    clientId: "app_test",
    appName: "Livepeer Agent",
    externalUserId: "eu_test",
    gatewayRequestId: "persist-1",
    pipeline: "hour",
    modelId: "livepeer-example/comfyui-stream",
    networkFeeUsdMicros: "2500",
    eventId: "evt_live",
  });
  assert.equal(row.modality, "realtime");
  assert.equal(row.pipeline, "live-video-to-video");
  assert.equal(row.kind, "live");
  assert.equal(row.costDisplay, "$0.0025");
});
