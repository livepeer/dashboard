import posthog from "posthog-js/dist/module.slim";

/**
 * Same-origin prefix that `next.config.ts` rewrites to PostHog's ingestion and
 * asset hosts. Deliberately not a word blockers match on ("analytics",
 * "tracking", "posthog", …).
 */
export const POSTHOG_PROXY_PATH = "/lpx";

function isReady() {
  return typeof window !== "undefined" && posthog.__loaded;
}

/**
 * Ties the anonymous session — and its UTM/referrer/channel context — to a
 * stable opaque member identity supplied by the authenticated server session.
 */
export function identifyMember(
  analyticsId: string,
  properties?: Record<string, unknown>
) {
  if (!isReady()) return;
  posthog.identify(analyticsId, properties);
}

export function captureEvent(
  event: string,
  properties?: Record<string, unknown>
) {
  if (!isReady()) return;
  posthog.capture(event, properties);
}

export function resetAnalyticsIdentity() {
  if (!isReady()) return;
  posthog.reset();
}
