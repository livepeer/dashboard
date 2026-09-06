import { outputKindForModality } from "@/lib/console/capability-modality";
import type {
  AccountActivityRow,
  AccountActivityStatus,
} from "@/lib/console/types";

export type MediaKind = "image" | "video" | "audio" | "text" | "json";

export type MediaSpec = {
  kind: MediaKind;
  title: string;
  label: string;
  format: string;
  metricLabel: string;
  metricValue: string;
  source: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  text?: string;
  json?: unknown;
};

const STATUS_LABEL: Record<AccountActivityStatus, string> = {
  active: "Streaming",
  success: "Succeeded",
  failed: "Failed",
  timeout: "Timed out",
  queued: "Queued",
  running: "Running",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

const IMAGE_EXT = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXT = new Set(["m3u8", "mov", "mp4", "webm"]);
const AUDIO_EXT = new Set(["flac", "m4a", "mp3", "ogg", "wav"]);

function urlExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").pop() ?? "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) return "";
    return name.slice(dot + 1).toLowerCase();
  } catch {
    return "";
  }
}

function formatFromUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  const ext = urlExtension(url);
  return ext ? ext.toUpperCase() : fallback;
}

function failedPayload(row: AccountActivityRow): unknown {
  return row.status === "timeout"
    ? {
        error: "deadline_exceeded",
        message: "No orchestrator responded in time.",
      }
    : {
        error: "inference_failed",
        message: "The pipeline returned a non-2xx status.",
      };
}

export function mediaSpecForRow(row: AccountActivityRow): MediaSpec {
  const source = row.signerLabel || "Livepeer";
  const outputKind = outputKindForModality(row.modality);
  const outputUrl = row.outputUrl?.trim() || undefined;
  const failed = row.status === "failed" || row.status === "timeout";

  if (failed) {
    return {
      kind: "json",
      title: `${row.model} request`,
      label: "Error",
      format: "JSON",
      metricLabel: "Result",
      metricValue: STATUS_LABEL[row.status],
      source,
      json: failedPayload(row),
    };
  }

  const ext = outputUrl ? urlExtension(outputUrl) : "";
  if (VIDEO_EXT.has(ext)) {
    return videoSpec(row, source, outputUrl);
  }
  if (IMAGE_EXT.has(ext)) {
    return imageSpec(row, source, outputUrl);
  }
  if (AUDIO_EXT.has(ext)) {
    return audioSpec(row, source, outputUrl);
  }

  if (outputKind === "text") {
    return textSpec(row, source, outputUrl);
  }
  if (outputKind === "video") {
    return videoSpec(row, source, outputUrl);
  }
  if (outputKind === "image") {
    return imageSpec(row, source, outputUrl);
  }
  if (outputKind === "audio") {
    return audioSpec(row, source, outputUrl);
  }

  if (
    row.pipeline === "language" ||
    row.pipeline === "llm" ||
    row.pipeline.includes("text")
  ) {
    return textSpec(row, source, outputUrl);
  }

  return {
    kind: "json",
    title: `${row.model} response`,
    label: "Data",
    format: "JSON",
    metricLabel: "Result",
    metricValue: STATUS_LABEL[row.status],
    source,
    json: outputUrl
      ? { output_url: outputUrl, request_id: row.providerRequestId ?? null }
      : { output: "not_stored" },
  };
}

function videoSpec(
  row: AccountActivityRow,
  source: string,
  outputUrl: string | undefined
): MediaSpec {
  return {
    kind: "video",
    title:
      row.kind === "live" ? `${row.model} session` : `${row.model} video`,
    label: "Video",
    format: formatFromUrl(outputUrl, "—"),
    metricLabel: "Output",
    metricValue: outputUrl ? "Stored" : "Not stored",
    source,
    videoUrl: outputUrl,
  };
}

function imageSpec(
  row: AccountActivityRow,
  source: string,
  outputUrl: string | undefined
): MediaSpec {
  return {
    kind: "image",
    title: `${row.model} image`,
    label: "Image",
    format: formatFromUrl(outputUrl, "—"),
    metricLabel: "Output",
    metricValue: outputUrl ? "Stored" : "Not stored",
    source,
    imageUrl: outputUrl,
  };
}

function audioSpec(
  row: AccountActivityRow,
  source: string,
  outputUrl: string | undefined
): MediaSpec {
  return {
    kind: "audio",
    title: `${row.model} audio`,
    label: "Audio",
    format: formatFromUrl(outputUrl, "—"),
    metricLabel: "Output",
    metricValue: outputUrl ? "Stored" : "Not stored",
    source,
    audioUrl: outputUrl,
  };
}

function textSpec(
  row: AccountActivityRow,
  source: string,
  outputUrl: string | undefined
): MediaSpec {
  return {
    kind: "text",
    title: `${row.model} response`,
    label: "Text",
    format: "TXT",
    metricLabel: "Output",
    metricValue: outputUrl ? "Stored" : "Not stored",
    source,
    text: outputUrl,
  };
}

export { STATUS_LABEL };
