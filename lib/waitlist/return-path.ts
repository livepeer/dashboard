/** Old Auth0-join bookmarks return to the email form, preserving campaign context. */
export function waitlistReturnPath(params: URLSearchParams): string {
  const query = new URLSearchParams();
  const referral = params.get("ref")?.trim();
  if (referral && /^[-_A-Za-z0-9]{1,64}$/.test(referral))
    query.set("ref", referral);
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ]) {
    const value = params.get(key)?.trim().slice(0, 200);
    if (value) query.set(key, value);
  }
  return `/waitlist${query.size ? `?${query}` : ""}`;
}
