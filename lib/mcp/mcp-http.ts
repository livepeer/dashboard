import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildRawMcpServer } from "./mcp-server";
import { extractBearer, verifyMcpUserJwt } from "./jwt";
import { corsHeaders, mcpIdentityBody, wwwAuthenticate } from "./oauth";
import { mcpPublicOrigin } from "./env";
import { clientClassFromHeaders, hashPrincipal, logToolCall } from "./log";
import { AccessError } from "@/lib/access/service";
import { requireApprovedMcpAccount } from "./access";

function accessFailure(req: Request, error: AccessError): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32003,
        message: error.message,
        data: { code: error.code },
      },
    },
    {
      status: error.status,
      headers: { ...corsHeaders(req), "Cache-Control": "no-store" },
    }
  );
}

export function optionsResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function identityResponse(req: Request): Response {
  return Response.json(mcpIdentityBody(req), { headers: corsHeaders(req) });
}

function unauthorized(req: Request, rpcId: unknown): Response {
  const origin = mcpPublicOrigin(req);
  const payload = {
    jsonrpc: "2.0",
    id: rpcId ?? null,
    error: {
      code: -32001,
      message: "Sign in to Livepeer to use this connector.",
      data: {
        signin_url: `${origin}/`,
        oauth_discovery: `${origin}/.well-known/oauth-protected-resource`,
        authorization_server: `${origin}/.well-known/oauth-authorization-server`,
      },
    },
  };
  return new Response(JSON.stringify(payload), {
    status: 401,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "WWW-Authenticate": wwwAuthenticate(req),
    },
  });
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  const bearer = extractBearer(req.headers.get("authorization"));
  if (!bearer) {
    let rpcId: unknown = null;
    try {
      const clone = req.clone();
      const body = (await clone.json()) as { id?: unknown };
      rpcId = body.id ?? null;
    } catch {
      rpcId = null;
    }
    return unauthorized(req, rpcId);
  }

  let principal;
  try {
    principal = await verifyMcpUserJwt(bearer);
  } catch (error) {
    if (error instanceof AccessError) return accessFailure(req, error);
    return unauthorized(req, null);
  }

  try {
    await requireApprovedMcpAccount(principal.externalUserId);
  } catch (error) {
    return accessFailure(
      req,
      error instanceof AccessError ? error : new AccessError("unavailable")
    );
  }

  const started = Date.now();
  const server = buildRawMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // SSE so progress notifications flush during 13-minute queue polls.
    enableJsonResponse: false,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req);
    const contentType = response.headers.get("content-type") ?? "";
    logToolCall({
      tool: "mcp_http",
      outcome: response.ok ? "ok" : "error",
      durationMs: Date.now() - started,
      principalHash: await hashPrincipal(principal.sub),
      clientClass: clientClassFromHeaders(req),
    });
    if (contentType.includes("text/event-stream") && response.body) {
      const { readable, writable } = new TransformStream();
      const closeServer = () => {
        void server.close().catch(() => undefined);
      };
      void response.body.pipeTo(writable).finally(closeServer);
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders(req))) {
        headers.set(k, v);
      }
      return new Response(readable, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    await server.close().catch(() => undefined);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(req))) {
      headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    await server.close().catch(() => undefined);
    throw err;
  }
}
