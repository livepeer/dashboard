import type { RunInputFieldSchema, RunInputSchema } from "@/lib/runs/types";
import {
  FAL_CAPABILITY_CATALOG,
  lookupFalCapability,
  type FalCapabilityCatalogEntry,
} from "@/lib/mcp/fal-capability-catalog";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function localRef(document: JsonObject, ref: unknown): JsonObject | null {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  let value: unknown = document;
  for (const encodedPart of ref.slice(2).split("/")) {
    const part = encodedPart.replace(/~1/g, "/").replace(/~0/g, "~");
    value = object(value)?.[part];
  }
  return object(value);
}

function resolved(document: JsonObject, schema: unknown): JsonObject | null {
  const node = object(schema);
  if (!node) return null;
  return localRef(document, node.$ref) ?? node;
}

function variants(document: JsonObject, schema: unknown): JsonObject[] {
  const node = resolved(document, schema);
  if (!node) return [];
  const alternatives = [node.anyOf, node.oneOf]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((value) => resolved(document, value))
    .filter((value): value is JsonObject => Boolean(value));
  const intersections = Array.isArray(node.allOf)
    ? node.allOf
        .map((value) => resolved(document, value))
        .filter((value): value is JsonObject => Boolean(value))
    : [];
  return [node, ...alternatives, ...intersections];
}

function primitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function firstString(nodes: JsonObject[], key: string): string | null {
  const value = nodes
    .map((node) => node[key])
    .find((item) => typeof item === "string");
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : null;
}

function firstNumber(nodes: JsonObject[], key: string): number | undefined {
  const value = nodes
    .map((node) => node[key])
    .find((item) => typeof item === "number");
  return typeof value === "number" ? value : undefined;
}

function fieldMetadata(
  document: JsonObject,
  schema: unknown,
  path: string[],
  required: boolean
): RunInputFieldSchema | null {
  const nodes = variants(document, schema);
  if (!nodes.length || !path.length) return null;
  const options = nodes
    .flatMap((node) => (Array.isArray(node.enum) ? node.enum : []))
    .filter(primitive);
  const types = nodes
    .map((node) => node.type)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");
  const defaultValue = nodes.map((node) => node.default).find(primitive);
  return {
    path: path.join("."),
    title: firstString(nodes, "title"),
    description: firstString(nodes, "description"),
    required,
    types: [...new Set(types)],
    options: [...new Set(options)],
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(firstNumber(nodes, "minimum") !== undefined
      ? { minimum: firstNumber(nodes, "minimum") }
      : {}),
    ...(firstNumber(nodes, "maximum") !== undefined
      ? { maximum: firstNumber(nodes, "maximum") }
      : {}),
    ...(firstNumber(nodes, "exclusiveMinimum") !== undefined
      ? { exclusiveMinimum: firstNumber(nodes, "exclusiveMinimum") }
      : {}),
    ...(firstNumber(nodes, "exclusiveMaximum") !== undefined
      ? { exclusiveMaximum: firstNumber(nodes, "exclusiveMaximum") }
      : {}),
  };
}

function requestSchema(
  document: JsonObject,
  endpointId: string
): JsonObject | null {
  const paths = object(document.paths);
  if (!paths) return null;
  const preferred = object(paths[`/${endpointId}`]);
  const pathItems = preferred ? [preferred] : Object.values(paths).map(object);
  for (const pathItem of pathItems) {
    const post = object(pathItem?.post);
    const requestBody = resolved(document, post?.requestBody);
    const content = object(requestBody?.content);
    const json = object(content?.["application/json"]);
    const schema = resolved(document, json?.schema);
    if (schema) return schema;
  }
  return null;
}

/** Convert a model OpenAPI document into the small, safe subset needed by history UI. */
export function parseFalInputSchema(
  documentValue: unknown,
  endpointId: string,
  schemaSha256: string
): RunInputSchema | null {
  const document = object(documentValue);
  if (!document) return null;
  const input = requestSchema(document, endpointId);
  if (!input) return null;
  const fields: RunInputFieldSchema[] = [];
  const seen = new Set<string>();

  const visit = (
    schema: unknown,
    path: string[],
    isRequired: boolean,
    ancestors: Set<JsonObject>
  ) => {
    const nodes = variants(document, schema);
    if (!nodes.length) return;
    const primary = nodes[0]!;
    if (ancestors.has(primary)) return;
    const nextAncestors = new Set(ancestors).add(primary);
    const metadata = fieldMetadata(document, schema, path, isRequired);
    if (metadata && !seen.has(metadata.path)) {
      seen.add(metadata.path);
      fields.push(metadata);
    }

    for (const node of nodes) {
      const properties = object(node.properties);
      const required = new Set(
        Array.isArray(node.required)
          ? node.required.filter(
              (value): value is string => typeof value === "string"
            )
          : []
      );
      if (properties) {
        for (const [name, child] of Object.entries(properties)) {
          visit(child, [...path, name], required.has(name), nextAncestors);
        }
      }
      if (node.items) visit(node.items, [...path, "*"], false, nextAncestors);
    }
  };

  visit(input, [], false, new Set());
  return { endpointId, schemaSha256, fields };
}

export function resolveFalCatalogEntry(input: {
  capability?: string | null;
  modelId?: string | null;
  endpoint?: string | null;
}): FalCapabilityCatalogEntry | null {
  for (const candidate of [input.capability, input.modelId]) {
    if (!candidate) continue;
    const direct = lookupFalCapability(candidate);
    if (direct) return direct;
    const byEndpoint = FAL_CAPABILITY_CATALOG.find(
      (entry) => entry.endpointId.toLowerCase() === candidate.toLowerCase()
    );
    if (byEndpoint) return byEndpoint;
    const tail = candidate.split("/").at(-1);
    if (tail) {
      const prefixed = lookupFalCapability(
        `livepeer-example/${tail.startsWith("fal-") ? tail : `fal-${tail}`}`
      );
      if (prefixed) return prefixed;
    }
  }
  const endpoint = input.endpoint?.trim().toLowerCase();
  return endpoint
    ? (FAL_CAPABILITY_CATALOG.find(
        (entry) => entry.endpointId.toLowerCase() === endpoint
      ) ?? null)
    : null;
}

type FalModelsResponse = {
  models?: Array<{ endpoint_id?: string; openapi?: unknown }>;
};

const inputSchemaRequests = new Map<string, Promise<RunInputSchema | null>>();

export async function loadFalInputSchema(
  entry: FalCapabilityCatalogEntry
): Promise<RunInputSchema | null> {
  const cacheKey = `${entry.endpointId}:${entry.schemaSha256}`;
  const existing = inputSchemaRequests.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    try {
      const url = new URL("https://api.fal.ai/v1/models");
      url.searchParams.set("endpoint_id", entry.endpointId);
      url.searchParams.set("expand", "openapi-3.0");
      const apiKey =
        process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim();
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(apiKey ? { Authorization: `Key ${apiKey}` } : {}),
        },
        next: { revalidate: 60 * 60 },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as FalModelsResponse;
      const model = payload.models?.find(
        (candidate) => candidate.endpoint_id === entry.endpointId
      );
      return model?.openapi
        ? parseFalInputSchema(
            model.openapi,
            entry.endpointId,
            entry.schemaSha256
          )
        : null;
    } catch {
      return null;
    }
  })();

  inputSchemaRequests.set(cacheKey, request);
  const result = await request;
  if (!result) inputSchemaRequests.delete(cacheKey);
  return result;
}
