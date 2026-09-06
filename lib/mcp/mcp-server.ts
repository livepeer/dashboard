import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  describeNetworkCapability,
  listNetworkCapabilities,
} from "./discovery";
import { runInference } from "./gateway";
import type { McpPrincipal } from "./jwt";
import { executeDurableRun } from "@/lib/runs/execute";
import * as runStore from "@/lib/runs/store";
import { fetchMcpUsage } from "./pymthouse-spend";
import { assertSpendable } from "./pymthouse-usage";
import {
  forgetAssets,
  listAssets,
  logAssetStoreError,
  publicAssetStoreError,
  serializeAsset,
} from "./store";
import { principalId } from "./log";

function text(data: unknown, isError = false) {
  return {
    isError,
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

const RUN_CAPABILITY_TIMEOUT_MS = 780_000;

async function sendRunProgress(
  extra: {
    _meta?: { progressToken?: string | number };
    sendNotification: (notification: {
      method: "notifications/progress";
      params: {
        progressToken: string | number;
        progress: number;
        total: number;
        message: string;
      };
    }) => Promise<void>;
  },
  elapsedMs: number,
  message: string
): Promise<void> {
  const token = extra._meta?.progressToken;
  if (token == null) return;
  try {
    await extra.sendNotification({
      method: "notifications/progress",
      params: {
        progressToken: token,
        progress: elapsedMs,
        total: RUN_CAPABILITY_TIMEOUT_MS,
        message,
      },
    });
  } catch {
    // Client may have disconnected; keep the job running.
  }
}

export function buildRawMcpServer(principal: McpPrincipal): McpServer {
  const pid = principalId(principal);
  const server = new McpServer({
    name: "Livepeer Agent MCP",
    version: "0.1.0",
    description:
      "Raw Livepeer MCP: name a capability, pass its exact inputs, get that capability. No planner.",
  });

  server.registerTool(
    "list_capabilities",
    {
      description:
        "List live-runner apps currently advertised in discovery. Use exact `name` (app id) with run_capability. `mode` is single-shot or persistent. Use describe_capability for fal route input hints when the app is listed.",
      inputSchema: {},
    },
    async () => text({ capabilities: await listNetworkCapabilities(principal) })
  );

  server.registerTool(
    "describe_capability",
    {
      description:
        "Describe one live-runner app by exact name from list_capabilities. Returns mode, price, fal endpoint_id/schema metadata when known, and an inputs_hint for run_capability.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => {
      const row = await describeNetworkCapability(principal, name);
      if (!row) return text({ error: "not_found", name }, true);
      return text(row);
    }
  );

  server.registerTool(
    "get_pricing",
    {
      description:
        "Return discovery price metadata for a capability if present.",
      inputSchema: { name: z.string().min(1) },
    },
    async ({ name }) => {
      const row = await describeNetworkCapability(principal, name);
      if (!row) return text({ error: "not_found", name }, true);
      return text({ name: row.name, price: row.price ?? null });
    }
  );

  server.registerTool(
    "upload",
    {
      description:
        "This host does not store bytes. Pass a public https URL as source_url / image_url on run_capability.",
      inputSchema: { hint: z.string().optional() },
    },
    async () =>
      text({
        error: "pass_https_url",
        message:
          "Pass a publicly reachable https URL in run_capability inputs (image_url, source_url, audio_url). No local upload store on this MCP.",
      })
  );

  server.registerTool(
    "upload_image",
    {
      description:
        "Alias of upload — pass a public https image URL to run_capability.",
      inputSchema: { hint: z.string().optional() },
    },
    async () =>
      text({
        error: "pass_https_url",
        message: "Pass image_url as a public https URL to run_capability.",
      })
  );

  server.registerTool(
    "create_upload_url",
    {
      description: "Not available on this host. Use a public https URL.",
      inputSchema: {},
    },
    async () =>
      text({
        error: "pass_https_url",
        message:
          "create_upload_url is not hosted here. Host the file yourself and pass https.",
      })
  );

  server.registerTool(
    "get_recent_assets",
    {
      description:
        "Recent media URLs for this principal, persisted in Postgres. Newest first, default 20, max 50.",
      inputSchema: {},
    },
    async () => {
      try {
        const assets = await listAssets(pid);
        return text({
          assets: assets.map(serializeAsset),
          count: assets.length,
        });
      } catch (err) {
        logAssetStoreError(err);
        return text(publicAssetStoreError(), true);
      }
    }
  );

  server.registerTool(
    "search_assets",
    {
      description:
        "Search this principal's persisted assets by capability, URL, or gateway_request_id substring.",
      inputSchema: { query: z.string().min(1) },
    },
    async ({ query }) => {
      try {
        const assets = await listAssets(pid, query);
        return text({
          assets: assets.map(serializeAsset),
          count: assets.length,
        });
      } catch (err) {
        logAssetStoreError(err);
        return text(publicAssetStoreError(), true);
      }
    }
  );

  server.registerTool(
    "forget_assets",
    {
      description:
        "Hide assets from this principal's asset library. Run history and references are retained. Omit ids to hide every library asset they own.",
      inputSchema: { ids: z.array(z.string()).optional() },
    },
    async ({ ids }) => {
      try {
        return text({ forgotten: await forgetAssets(pid, ids) });
      } catch (err) {
        logAssetStoreError(err);
        return text(publicAssetStoreError(), true);
      }
    }
  );

  server.registerTool(
    "get_cost_report",
    {
      description:
        "Current UTC calendar day OpenMeter network-fee spend (00:00–23:59 UTC). hasAccess is the PymtHouse spendable hard limit.",
      inputSchema: {},
    },
    async () => {
      try {
        return text(await fetchMcpUsage(principal));
      } catch (err) {
        return text(err instanceof Error ? err.message : String(err), true);
      }
    }
  );

  server.registerTool(
    "me",
    {
      description:
        "Who this token is keyed as. console_access is unknown on this host (check Console).",
      inputSchema: {},
    },
    async () =>
      text({
        sub: principal.sub,
        external_user_id: principal.externalUserId,
        public_client_id: principal.publicClientId,
        email: principal.email ?? null,
        console_access: "unknown",
      })
  );

  server.registerTool(
    "me_usage",
    {
      description:
        "Current UTC calendar day OpenMeter network-fee spend (00:00–23:59 UTC).",
      inputSchema: {},
    },
    async () => {
      try {
        return text(await fetchMcpUsage(principal));
      } catch (err) {
        return text(err instanceof Error ? err.message : String(err), true);
      }
    }
  );

  server.registerTool(
    "run_capability",
    {
      description:
        "Deterministic passthrough: name a Livepeer capability and pass its exact inputs. Single-shot capabilities POST the discovery URL as published — do not pass endpoint. Persistent apps require endpoint (the app path, e.g. /hello). Use describe_capability for fal route input hints. Blocks until the runner (or fal queue) completes, up to 13 minutes. Queue receipts are polled via status_url; if polling is unauthorized the handle is returned instead of url:null.",
      inputSchema: {
        capability: z.string().min(1),
        inputs: z.record(z.unknown()).optional(),
        prompt: z.string().optional(),
        endpoint: z.string().optional(),
      },
    },
    async ({ capability, inputs, prompt, endpoint }, extra) => {
      const started = Date.now();
      const heartbeat = setInterval(() => {
        void sendRunProgress(extra, Date.now() - started, "waiting on runner");
      }, 5_000);
      void sendRunProgress(extra, 0, "waiting on runner");
      try {
        const result = await executeDurableRun(
          principal,
          {
            capability,
            ...(inputs === undefined ? {} : { inputs }),
            ...(prompt === undefined ? {} : { prompt }),
            ...(endpoint === undefined ? {} : { endpoint }),
          },
          {
            store: runStore,
            checkSpend: async () =>
              assertSpendable(await fetchMcpUsage(principal)),
            describe: () => describeNetworkCapability(principal, capability),
            infer: (request) => runInference(principal, request),
            onProgress: (info) =>
              sendRunProgress(extra, info.elapsedMs, `queue ${info.status}`),
          }
        );
        return text(result.payload, result.isError);
      } finally {
        clearInterval(heartbeat);
      }
    }
  );

  return server;
}
