const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const CURSOR_HTTPS_HOSTS = new Set(["www.cursor.com", "cursor.com"]);
const CHATGPT_HOSTS = new Set(["chatgpt.com"]);
const CHATGPT_CALLBACK_ID = /^[A-Za-z0-9_-]{1,64}$/;

function hostnameOf(parsed: URL): string {
  return parsed.hostname.replace(/^\[|\]$/g, "");
}

function parseRedirectUri(redirectUri: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  return parsed;
}

function isLoopbackHttp(parsed: URL): boolean {
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(hostnameOf(parsed));
}

function isChatGPTConnectorRedirect(parsed: URL): boolean {
  if (parsed.protocol !== "https:" || !CHATGPT_HOSTS.has(hostnameOf(parsed))) {
    return false;
  }
  if (parsed.pathname === "/connector_platform_oauth_redirect") return true;
  const parts = parsed.pathname.split("/").filter(Boolean);
  return (
    parts.length === 3 &&
    parts[0] === "connector" &&
    parts[1] === "oauth" &&
    CHATGPT_CALLBACK_ID.test(parts[2] ?? "")
  );
}

export function isAllowedClientRedirectUri(redirectUri: string): boolean {
  const parsed = parseRedirectUri(redirectUri);
  if (!parsed) return false;

  const host = hostnameOf(parsed);

  if (parsed.protocol === "https:" && CLAUDE_HOSTS.has(host)) {
    return (
      parsed.pathname === "/api/mcp/auth_callback" ||
      parsed.pathname.endsWith("/api/mcp/auth_callback")
    );
  }

  // RFC 8252 native-app loopback: any path on 127.0.0.1 / localhost / ::1.
  if (isLoopbackHttp(parsed)) {
    return true;
  }

  // Cursor desktop DCR still registers the custom-scheme callback on some
  // builds. Web / Cursor Agents use the www.cursor.com HTTPS callback.
  if (parsed.protocol === "cursor:") {
    return (
      host === "anysphere.cursor-mcp" && parsed.pathname === "/oauth/callback"
    );
  }
  if (parsed.protocol === "https:" && CURSOR_HTTPS_HOSTS.has(host)) {
    return parsed.pathname === "/agents/mcp/oauth/callback";
  }

  // ChatGPT / Codex hosted connector callbacks (CIMD and DCR).
  if (isChatGPTConnectorRedirect(parsed)) {
    return true;
  }

  return false;
}

/**
 * Registered vs requested redirect. HTTPS / custom-scheme stays exact.
 * Loopback follows RFC 8252 §7.3 (any port) and treats 127.0.0.1 / localhost
 * / ::1 as the same host so Codex DCR/authorize host swaps still match.
 * Also used during token redemption for native-client compatibility. This
 * loopback exception is tracked as production-hold review finding SEC-04.
 */
export function redirectUrisMatch(
  registered: string,
  requested: string
): boolean {
  if (registered === requested) return true;
  const a = parseRedirectUri(registered);
  const b = parseRedirectUri(requested);
  if (!a || !b || !isLoopbackHttp(a) || !isLoopbackHttp(b)) return false;
  return a.pathname === b.pathname && a.search === b.search;
}

export function clientAllowsRedirect(
  redirectUris: string[],
  requested: string
): boolean {
  return redirectUris.some((uri) => redirectUrisMatch(uri, requested));
}

const MAX_REDIRECT_URIS = 16;

export function normalizeRedirectUris(raw: unknown): string[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > MAX_REDIRECT_URIS
  ) {
    return null;
  }
  const uris: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length > 512) return null;
    const uri = item.trim();
    if (!uri || !isAllowedClientRedirectUri(uri)) return null;
    uris.push(uri);
  }
  return uris;
}
