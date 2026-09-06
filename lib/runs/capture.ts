export const CAPTURE_VERSION = 1;
export const MAX_CAPTURE_BYTES = 1024 * 1024;
export const MAX_CAPTURE_DEPTH = 32;

export type CaptureMetadata = {
  version: number;
  redactedPaths: string[];
  omittedPaths: string[];
};
export type CapturedJson = { value: unknown; metadata: CaptureMetadata };

const secretKey =
  /^(?:authorization|proxy.?authorization|cookie|set.?cookie|password|passwd|secret|client.?secret|access.?token|refresh.?token|id.?token|(?:x[-_])?api.?key|private.?key|credential|credentials|token|signature|sig|x-amz-.+|x-goog-.+|aws_session_token|access_key_id|secret_access_key)$/i;
const bytesKey =
  /^(?:base64|image_base64|audio_base64|video_base64|file_base64|bytes|file_bytes)$/i;

export class CaptureLimitError extends Error {
  constructor() {
    super("Submitted arguments exceed the 1 MiB / 32-level capture limit.");
  }
}

/** Validate the original JSON before sanitization, so omissions cannot bypass limits. */
export function captureJson(input: unknown): CapturedJson {
  const serialized = JSON.stringify(input);
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, "utf8") > MAX_CAPTURE_BYTES
  )
    throw new CaptureLimitError();
  const metadata: CaptureMetadata = {
    version: CAPTURE_VERSION,
    redactedPaths: [],
    omittedPaths: [],
  };
  const walk = (value: unknown, path: string, depth: number): unknown => {
    if (depth > MAX_CAPTURE_DEPTH) throw new CaptureLimitError();
    if (typeof value === "string") {
      if (/data:[^,\s]*,/i.test(value)) {
        metadata.omittedPaths.push(path);
        return { omitted: "embedded_file_bytes" };
      }
      if (/https?:\/\//i.test(value)) {
        const cleaned = value.replace(
          /https?:\/\/[^\s<>"']+/gi,
          (candidate) => {
            try {
              const url = new URL(candidate);
              let redacted = false;
              if (url.username || url.password) {
                url.username = "";
                url.password = "";
                redacted = true;
              }
              for (const key of [...url.searchParams.keys()]) {
                if (
                  secretKey.test(key) ||
                  /^(?:key|auth|policy|key-pair-id)$/i.test(key)
                ) {
                  url.searchParams.set(key, "[REDACTED]");
                  redacted = true;
                }
              }
              if (redacted) {
                metadata.redactedPaths.push(path);
                return url.toString();
              }
            } catch {
              /* Non-URL strings remain ordinary input. */
            }
            return candidate;
          }
        );
        if (cleaned !== value) return cleaned;
      }
      if (/^(?:Bearer|Basic)\s+\S+$/i.test(value)) {
        metadata.redactedPaths.push(path);
        return "[REDACTED]";
      }
      return value;
    }
    if (Array.isArray(value))
      return value.map((child, i) => walk(child, `${path}/${i}`, depth + 1));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          const childPath = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
          if (secretKey.test(key)) {
            metadata.redactedPaths.push(childPath);
            return [key, "[REDACTED]"];
          }
          if (bytesKey.test(key)) {
            metadata.omittedPaths.push(childPath);
            return [key, { omitted: "embedded_file_bytes" }];
          }
          return [key, walk(child, childPath, depth + 1)];
        })
      );
    }
    return value;
  };
  // Count depth even below a redacted key before omitting it.
  const depthCheck = (value: unknown, depth: number): void => {
    if (depth > MAX_CAPTURE_DEPTH) throw new CaptureLimitError();
    if (value && typeof value === "object")
      for (const child of Object.values(value)) depthCheck(child, depth + 1);
  };
  depthCheck(input, 0);
  const value = walk(input, "", 0);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_CAPTURE_BYTES)
    throw new CaptureLimitError();
  return { value, metadata };
}

export function captureResult(input: unknown): {
  value: unknown;
  capture: CaptureMetadata;
  omitted?: string;
} {
  try {
    const captured = captureJson(input ?? null);
    return { value: captured.value, capture: captured.metadata };
  } catch {
    return {
      value: null,
      omitted: "result_capture_limit",
      capture: {
        version: CAPTURE_VERSION,
        redactedPaths: [],
        omittedPaths: [""],
      },
    };
  }
}
