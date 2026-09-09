import { isQueueControlUrl } from "@pymthouse/gateway-web";

export type CapturedOutput = {
  url: string;
  mediaKind: "image" | "video" | "audio" | "unknown";
};

/** Only documented media fields, never prompt URLs or arbitrary nested links. */
export function extractRunOutputs(result: unknown): CapturedOutput[] {
  const outputs = new Map<string, CapturedOutput>();
  const add = (value: unknown, mediaKind: CapturedOutput["mediaKind"]) => {
    const url =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? (value as Record<string, unknown>).url
          : null;
    if (typeof url !== "string" || isQueueControlUrl(url)) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return;
      // URLs with credentials are not durable public media references.
      if (
        [...parsed.searchParams.keys()].some((key) =>
          /token|signature|credential|api.?key|^sig$|^x-amz-|^x-goog-/i.test(
            key
          )
        )
      )
        return;
      if (!outputs.has(url)) outputs.set(url, { url, mediaKind });
    } catch {
      /* Not a public asset URL. */
    }
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const row = value as Record<string, unknown>;
    for (const [key, kind] of [
      ["image", "image"],
      ["imageUrl", "image"],
      ["image_url", "image"],
      ["video", "video"],
      ["videoUrl", "video"],
      ["video_url", "video"],
      ["audio", "audio"],
      ["audioUrl", "audio"],
      ["audio_url", "audio"],
    ] as const)
      add(row[key], kind);
    add(row.url, "unknown");
    for (const [key, kind] of [
      ["images", "image"],
      ["image_urls", "image"],
      ["videos", "video"],
      ["video_urls", "video"],
      ["audios", "audio"],
      ["audio_urls", "audio"],
    ] as const) {
      if (Array.isArray(row[key])) for (const item of row[key]) add(item, kind);
    }
    for (const key of ["data", "output", "result"]) visit(row[key], depth + 1);
  };
  visit(result, 0);
  return [...outputs.values()];
}
