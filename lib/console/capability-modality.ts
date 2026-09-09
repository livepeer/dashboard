import { lookupFalCapability } from "../mcp/fal-capability-catalog";

/**
 * History used to treat OpenMeter `pipeline` as a first-party pipeline id
 * (`text-to-image`, `live-video-to-video`, …) and abbreviate it to a modality
 * tag (`t2i`). Live-runner tickets now write the *price unit* there (`fixed`,
 * `hour`, `720p`), so the old first-letter fallback rendered "f".
 *
 * Capability metadata already carries the missing signal:
 *   - first-party tickets still have a real pipeline name
 *   - live-runner apps advertise a fal `endpoint_id` (and an app id whose
 *     last tokens are i2v / t2v / tts / …)
 *
 * Pipeline names, when needed internally (preview kind, live vs batch),
 * are derived from that modality rather than shown to the user.
 */

const PRICE_UNITS = new Set(["fixed", "hour", "720p", "seconds", "wei", "usd"]);

const PIPELINE_TO_MODALITY: Record<string, string> = {
  "audio-to-text": "asr",
  "image-to-image": "edit",
  "image-to-text": "text",
  "image-to-video": "i2v",
  language: "text",
  live: "realtime",
  llm: "text",
  "live-transcoding": "v2v",
  "live-video-to-video": "v2v",
  "speech-to-text": "asr",
  "text-generation": "text",
  "text-to-audio": "audio",
  "text-to-image": "t2i",
  "text-to-speech": "tts",
  "text-to-video": "t2v",
  transcoding: "v2v",
  "video-understanding": "text",
  "video-to-video": "v2v",
};

/** Longest-first so `image-to-video` wins over a later `video` token. */
const PHRASE_TO_MODALITY: Array<[RegExp, string]> = [
  [/first-last-frame-to-video|keyframes-to-video/, "transition"],
  [/reference-to-video|ref2v/, "ref2v"],
  [/images?-to-video|\bi2v\b/, "i2v"],
  [/text-to-video|\bt2v\b/, "t2v"],
  [/audio-to-video|\ba2v\b/, "a2v"],
  [/video-to-video|\bv2v\b/, "v2v"],
  [/video-to-music|\bv2m\b|video-soundtrack/, "v2m"],
  [/text-to-image|\bt2i\b/, "t2i"],
  [/text-to-audio|\bt2a\b|\bsfx\b/, "audio"],
  [/text-to-3d|\bt3d\b/, "t3d"],
  [/image-to-3d|\bi3d\b/, "i3d"],
  [/text-to-speech|\btts\b/, "tts"],
  [/whisper|transcribe|\basr\b|subtitles/, "asr"],
  [/bg-remove|background-removal|birefnet/, "bg-remove"],
  [/video-upscale|scale-video|upscale/, "upscale"],
  [/inpaint/, "inpaint"],
  [/erase/, "erase"],
  [/fill/, "fill"],
  [/edit-video|\/edit\b|\bedit\b/, "edit"],
  [/extend-video|\bextend\b/, "extend"],
  [/lipsync|talking-head|omnihuman/, "i2v"],
  [/\breframe\b/, "v2v"],
  [/\bmusic\b/, "t2m"],
  [/\bffmpeg\b/, "tool"],
];

const SLUG_TOKEN_TO_MODALITY: Record<string, string> = {
  a2t: "asr",
  a2v: "a2v",
  asr: "asr",
  i2i: "edit",
  i2v: "i2v",
  i3d: "i3d",
  ref2v: "ref2v",
  s2t: "asr",
  t2a: "audio",
  t2i: "t2i",
  t2s: "tts",
  t2t: "text",
  t2v: "t2v",
  t3d: "t3d",
  tts: "tts",
  v2m: "v2m",
  v2t: "text",
  v2v: "v2v",
};

const MODALITY_TO_PIPELINE: Record<string, string> = {
  asr: "audio-to-text",
  audio: "text-to-audio",
  "bg-remove": "image-to-image",
  edit: "image-to-image",
  erase: "image-to-image",
  extend: "video-to-video",
  fill: "image-to-image",
  i2v: "image-to-video",
  inpaint: "image-to-image",
  realtime: "live-video-to-video",
  ref2v: "image-to-video",
  t2i: "text-to-image",
  t2m: "text-to-audio",
  t2v: "text-to-video",
  text: "text-generation",
  transition: "image-to-video",
  tts: "text-to-speech",
  upscale: "image-to-image",
  v2m: "text-to-audio",
  v2v: "video-to-video",
};

const IMAGE_MODALITIES = new Set([
  "bg-remove",
  "edit",
  "erase",
  "fill",
  "inpaint",
  "t2i",
  "upscale",
  "vto",
]);

const VIDEO_MODALITIES = new Set([
  "a2v",
  "extend",
  "hdr",
  "i2v",
  "ingredient",
  "realtime",
  "ref2v",
  "t2v",
  "transition",
  "v2v",
]);

const AUDIO_MODALITIES = new Set(["audio", "t2m", "tts", "v2m"]);

const TEXT_MODALITIES = new Set(["asr", "text"]);

const MODALITY_LABELS: Record<string, string> = {
  a2v: "Audio to video",
  asr: "Speech to text",
  audio: "Text to audio",
  "bg-remove": "Background removal",
  edit: "Image editing",
  erase: "Image erasing",
  extend: "Video extension",
  fill: "Image fill",
  i2v: "Image to video",
  i3d: "Image to 3D",
  inpaint: "Image inpainting",
  realtime: "Realtime video",
  ref2v: "Reference to video",
  t2i: "Text to image",
  t2m: "Text to music",
  t2v: "Text to video",
  text: "Text generation",
  transition: "Frame transition",
  tts: "Text to speech",
  upscale: "Image upscaling",
  v2m: "Video to music",
  v2v: "Video to video",
};

export function capabilityPresentation(
  title: string,
  modality: string
): { title: string; modality: string } {
  const label = MODALITY_LABELS[modality] ?? modality;
  if (!label || modality === "unknown") return { title, modality: label };
  const phrase = label
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s_/-]+");
  const shorthand = modality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutPhrase = title.replace(
    new RegExp(`(?:\\s*[·|—:/-]\\s*)?\\b${phrase}\\b`, "gi"),
    " "
  );
  const withoutShorthand = withoutPhrase.replace(
    new RegExp(`(?:\\s*[·|—:/-]\\s*)?\\b${shorthand}\\b`, "gi"),
    " "
  );
  const cleanTitle = withoutShorthand
    .replace(/\s+/g, " ")
    .replace(/[·|—:/-]+\s*$/, "")
    .trim();
  return { title: cleanTitle || title, modality: label };
}

export type CapabilityMediaKind = "image" | "video" | "audio" | "text" | "json";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isPriceUnit(value: string): boolean {
  return PRICE_UNITS.has(value);
}

function isKnownPipeline(value: string): boolean {
  return value in PIPELINE_TO_MODALITY;
}

function lookupCatalog(capabilityId: string) {
  const direct = lookupFalCapability(capabilityId);
  if (direct) return direct;

  const slug = normalize(capabilityId);
  const tail = slug.split("/").pop() ?? slug;
  const prefixed = lookupFalCapability(`livepeer-example/${tail}`);
  if (prefixed) return prefixed;
  if (!tail.startsWith("fal-")) {
    return lookupFalCapability(`livepeer-example/fal-${tail}`);
  }
  return null;
}

function modalityFromHaystack(haystack: string): string | null {
  const normalized = `/${haystack.replace(/[_./]+/g, "-")}/`;
  for (const [pattern, modality] of PHRASE_TO_MODALITY) {
    if (pattern.test(normalized)) return modality;
  }

  for (const token of haystack.split(/[-_/]+/)) {
    const mapped = SLUG_TOKEN_TO_MODALITY[token];
    if (mapped) return mapped;
  }

  if (/\bimage\b/.test(normalized) && !/\bvideo\b/.test(normalized)) {
    return "t2i";
  }
  if (/\b(flux|ideogram)\b/.test(normalized) && !/\bvideo\b/.test(normalized)) {
    return "t2i";
  }
  if (/\bvideo\b/.test(normalized)) return "t2v";
  return null;
}

export function resolveCapabilityModality(input: {
  pipeline?: string | null;
  capabilityId?: string | null;
}): string | null {
  const pipeline = normalize(input.pipeline);
  if (pipeline && isKnownPipeline(pipeline)) {
    return PIPELINE_TO_MODALITY[pipeline] ?? null;
  }

  const capabilityId = (input.capabilityId ?? "").trim();
  const catalog = capabilityId ? lookupCatalog(capabilityId) : null;
  const haystack = [
    capabilityId,
    catalog?.name,
    catalog?.label,
    catalog?.endpointId,
  ]
    .filter(Boolean)
    .join("/");
  const fromMeta = haystack ? modalityFromHaystack(haystack) : null;
  if (fromMeta) return fromMeta;

  if (pipeline && !isPriceUnit(pipeline)) {
    const fromPipeline = modalityFromHaystack(pipeline);
    if (fromPipeline) return fromPipeline;
  }

  return null;
}

export function pipelineForModality(modality: string): string | null {
  return MODALITY_TO_PIPELINE[modality] ?? null;
}

export function outputKindForModality(modality: string): CapabilityMediaKind {
  if (IMAGE_MODALITIES.has(modality)) return "image";
  if (VIDEO_MODALITIES.has(modality)) return "video";
  if (AUDIO_MODALITIES.has(modality)) return "audio";
  if (TEXT_MODALITIES.has(modality)) return "text";
  return "json";
}

/**
 * Resolve the display tag and, when the stored pipeline is a price unit,
 * the inferred first-party pipeline name used by previews.
 *
 * Persistent live jobs bill as `hour` (or are named `live`) and have no fal
 * media modality — those are `realtime`. Unknown *batch* tickets (`fixed`
 * with no catalog hit) stay `unknown` so they are not shown as live video.
 */
export function resolveActivityCapability(input: {
  pipeline?: string | null;
  capabilityId?: string | null;
}): { modality: string; pipeline: string } {
  const stored = (input.pipeline ?? "").trim();
  const normalizedStored = normalize(stored);
  const resolved = resolveCapabilityModality(input);
  if (resolved) {
    const inferred = pipelineForModality(resolved);
    const pipeline =
      stored && !isPriceUnit(normalizedStored) ? stored : (inferred ?? stored);
    return { modality: resolved, pipeline: pipeline || "unknown" };
  }

  if (normalizedStored === "hour" || normalizedStored === "live") {
    return {
      modality: "realtime",
      pipeline: pipelineForModality("realtime") ?? "live-video-to-video",
    };
  }

  return {
    modality: "unknown",
    pipeline: stored && !isPriceUnit(normalizedStored) ? stored : "unknown",
  };
}
