/** A provider availability notice, not an instruction to expire saved history
 * or remove a URL after seven days. Do not apply fal's default to other hosts. */
export function mediaRetentionNotice(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "fal.media" ||
        parsed.hostname.endsWith(".fal.media"))
    ) {
      return "Media may become unavailable after 7 days. Download to keep.";
    }
  } catch {
    // Unknown source: do not invent a retention promise.
  }
  return null;
}
