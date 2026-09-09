import type { JsonValue, RunAsset, RunDetail } from "@/lib/runs/types";
import { extractRunOutputs } from "@/lib/runs/outputs";

export const ASSET_PUBLIC_ORIGIN = "https://earlyaccess.livepeer.org";

export function publicAssetUrl(id: string): string {
  return `${ASSET_PUBLIC_ORIGIN}/api/assets/${encodeURIComponent(id)}`;
}

export function publicAsset(asset: RunAsset): RunAsset {
  return { ...asset, url: publicAssetUrl(asset.id) };
}

export function replaceAssetUrls(
  value: JsonValue,
  assets: Pick<RunAsset, "id" | "url">[]
): JsonValue {
  const urls = new Map(
    assets.map((asset) => [asset.url, publicAssetUrl(asset.id)])
  );
  const visit = (item: JsonValue): JsonValue => {
    if (typeof item === "string") return urls.get(item) ?? item;
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, visit(child)])
      );
    }
    return item;
  };
  return visit(value);
}

export function removeAssetUrls(value: JsonValue, urls: string[]): JsonValue {
  const blocked = new Set(urls);
  const visit = (item: JsonValue): JsonValue | undefined => {
    if (typeof item === "string") return blocked.has(item) ? undefined : item;
    if (Array.isArray(item)) {
      return item
        .map(visit)
        .filter((child): child is JsonValue => child !== undefined);
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .map(([key, child]) => [key, visit(child)] as const)
          .filter(
            (entry): entry is readonly [string, JsonValue] =>
              entry[1] !== undefined
          )
      );
    }
    return item;
  };
  return visit(value) ?? null;
}

/** Remove provider media origins at the HTTP/MCP boundary while retaining them in storage. */
export function publicRunDetail(detail: RunDetail): RunDetail {
  const assets = detail.assets.map(publicAsset);
  const submitted = detail.submittedArguments;
  const submittedMedia = submitted
    ? extractRunOutputs(submitted).map((asset) => asset.url)
    : [];
  const resultMedia = detail.result
    ? extractRunOutputs(detail.result.value).map((asset) => asset.url)
    : [];
  return {
    ...detail,
    assets,
    submittedArguments: submitted
      ? (removeAssetUrls(
          replaceAssetUrls(submitted, detail.assets),
          submittedMedia.filter(
            (url) => !detail.assets.some((asset) => asset.url === url)
          )
        ) as Record<string, JsonValue>)
      : null,
    result: detail.result
      ? {
          ...detail.result,
          value: removeAssetUrls(
            replaceAssetUrls(detail.result.value, detail.assets),
            resultMedia.filter(
              (url) => !detail.assets.some((asset) => asset.url === url)
            )
          ),
        }
      : null,
  };
}
