import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getAssetSource } from "@/lib/mcp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARDED_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  ) {
    throw new Error("unsafe_asset_origin");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new Error("unsafe_asset_origin");
  }
  return url;
}

async function proxy(request: Request, id: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const asset = await getAssetSource(id);
  if (!asset) return new Response("Not found", { status: 404 });

  try {
    let target = await assertPublicHttps(asset.url);
    let upstream: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      upstream = await fetch(target, {
        method: request.method,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: request.headers.get("accept") ?? "*/*",
          "Accept-Encoding": "identity",
          ...(request.headers.get("range")
            ? { Range: request.headers.get("range")! }
            : {}),
        },
      });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get("location");
      await upstream.body?.cancel();
      if (!location || redirects === 3) throw new Error("asset_redirect");
      target = await assertPublicHttps(new URL(location, target).href);
    }
    if (!upstream) throw new Error("asset_unavailable");
    const headers = new Headers({
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    });
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response("Asset unavailable", {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return proxy(request, (await context.params).id);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return proxy(request, (await context.params).id);
}
