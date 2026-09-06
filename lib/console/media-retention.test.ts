import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaRetentionNotice } from "./media-retention";

test("fal media gets an availability notice, never an expired status", () => {
  const notice = mediaRetentionNotice("https://v3b.fal.media/files/image.png");
  assert.match(notice!, /may become unavailable after 7 days/);
  assert.doesNotMatch(notice!, /expired/i);
});

test("does not invent seven-day expiry for absent, invalid or other media", () => {
  for (const url of [
    undefined,
    "invalid",
    "https://example.com/image.png",
    "https://fal.media.example.com/image.png",
  ])
    assert.equal(mediaRetentionNotice(url), null);
});
