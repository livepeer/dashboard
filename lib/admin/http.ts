import { AccessError } from "@/lib/access/service";
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new AccessError("pending", "cross_site_request");
}
export function apiError(error: unknown) {
  const typed = error as { status?: number; code?: string };
  const status = [400, 401, 403, 409, 503].includes(typed?.status ?? 0)
    ? typed.status!
    : 503;
  return Response.json(
    { error: typed?.code ?? "access_unavailable" },
    { status, headers: { "cache-control": "no-store" } }
  );
}
