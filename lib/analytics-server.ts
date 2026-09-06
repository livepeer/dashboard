import "server-only";

import { PostHog } from "posthog-node";

type VerificationAnalyticsEvent = {
  analyticsId: string;
  verificationId: string;
};

export async function captureEmailVerified({
  analyticsId,
  verificationId,
}: VerificationAnalyticsEvent) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const client = new PostHog(apiKey, {
    host: "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  try {
    client.capture({
      distinctId: analyticsId,
      event: "waitlist_email_verified",
      uuid: verificationId,
      disableGeoip: true,
    });
  } finally {
    await client.shutdown();
  }
}
