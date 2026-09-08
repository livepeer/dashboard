/**
 * Empty `inputSchema: {}` becomes Zod v4-mini, which rejects omitted
 * `arguments`. Clients often omit them on no-arg tools (`get_recent_assets`).
 */
export function defaultOmittedToolArguments(body: unknown): unknown {
  const patch = (message: unknown): unknown => {
    if (!message || typeof message !== "object") return message;
    const row = message as { method?: unknown; params?: unknown };
    if (
      row.method !== "tools/call" ||
      !row.params ||
      typeof row.params !== "object"
    ) {
      return message;
    }
    const params = row.params as { arguments?: unknown };
    if (params.arguments !== undefined) return message;
    return { ...row, params: { ...params, arguments: {} } };
  };
  return Array.isArray(body) ? body.map(patch) : patch(body);
}
