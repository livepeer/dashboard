import postgres from "postgres";

export const PREVIEW_FIXTURE_SOURCE = "preview_fixture_v1";
const PREVIEW_BRANCH = "br-holy-sound-auugm104";
const PREVIEW_HOST =
  "ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech";

type SeedEnv = Record<string, string | undefined>;
export function assertPreviewSeedTarget(env: SeedEnv) {
  const raw = env.PREVIEW_SEED_DATABASE_URL;
  if (!raw || env.PREVIEW_SEED_BRANCH_ID !== PREVIEW_BRANCH)
    throw new Error("Explicit isolated preview target required");
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== PREVIEW_HOST
  )
    throw new Error("Unapproved preview database");
  return raw;
}

export function previewContactPlan() {
  return Array.from({ length: 150 }, (_, index) => ({
    email: `preview-${String(index + 1).padStart(3, "0")}@preview.livepeer.invalid`,
    referralCode: `preview-v1-${String(index + 1).padStart(3, "0")}`,
    verified: index < 135,
    access:
      index < 90
        ? "waiting"
        : index < 120
          ? "approved"
          : index < 135
            ? "revoked"
            : "unverified",
    subscribed: index % 3 === 0,
    referral: index > 0 && index <= 30,
  }));
}

/** Explicit preview only. Never reads DATABASE_URL, creates users, resets existing
 * fixtures, queues emails or contacts any external service. Default is read-only. */
export async function seedPreviewContacts(env: SeedEnv, apply = false) {
  const url = assertPreviewSeedTarget(env);
  if (apply && env.PREVIEW_FIXTURE_CAPTURE_READY !== "1")
    throw new Error("Verify deployed fixture email capture before seeding");
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    return await client.begin((tx) => seedPreviewContactRows(tx, apply));
  } finally {
    await client.end();
  }
}

/** Caller supplies an already authorized transaction; also used by guarded
 * disposable-database tests. Never call on an unvalidated database. */
export async function seedPreviewContactRows(
  tx: postgres.TransactionSql,
  apply = false
) {
  if (!apply) await tx`set transaction read only`;
  else await tx`select pg_advisory_xact_lock(9052150)`;
  const [existing] =
    await tx`select count(*)::int as n from waitlist_signups where enrollment_source=${PREVIEW_FIXTURE_SOURCE}`;
  if (existing.n !== 0 && existing.n !== 150)
    throw new Error(
      "Partial fixture set requires review; no records overwritten"
    );
  if (!apply || existing.n === 150)
    return { existing: existing.n, created: 0, planned: 150 };
  const [collision] =
    await tx`select count(*)::int as n from waitlist_signups where normalized_email like '%@preview.livepeer.invalid'`;
  if (collision.n) throw new Error("Reserved fixture addresses already exist");
  const plan = previewContactPlan();
  const base = Date.UTC(2026, 8, 5, 12);
  const rows = plan.map((item, i) => ({
    email: item.email,
    normalized_email: item.email,
    referral_code: item.referralCode,
    status: item.verified ? "confirmed" : "pending",
    enrollment_source: PREVIEW_FIXTURE_SOURCE,
    first_touch: JSON.stringify({ utm_source: PREVIEW_FIXTURE_SOURCE }),
    last_touch: JSON.stringify({ utm_source: PREVIEW_FIXTURE_SOURCE }),
    first_seen_at: new Date(base - i * 86400000),
    last_seen_at: new Date(base - i * 86400000),
    confirmed_at: item.verified ? new Date(base - i * 86400000 + 60000) : null,
    marketing_consent: item.subscribed,
  }));
  const created =
    await tx`insert into waitlist_signups ${tx(rows)} returning id,normalized_email`;
  const ids = new Map(created.map((row) => [row.normalized_email, row.id]));
  const subscriptionRows = plan.map((item) => ({
    normalized_email: item.email,
    purpose: "product_marketing",
    status: item.subscribed ? "subscribed" : "unsubscribed",
    signup_id: ids.get(item.email),
    source: PREVIEW_FIXTURE_SOURCE,
  }));
  const subscriptions =
    await tx`insert into email_subscriptions ${tx(subscriptionRows)} returning id,signup_id,status`;
  await tx`insert into consent_events ${tx(subscriptions.map((row) => ({ signup_id: row.signup_id, subscription_id: row.id, purpose: "product_marketing", granted: row.status === "subscribed", disclosure_version: "synthetic-preview-only-v1", source: PREVIEW_FIXTURE_SOURCE })))}`;
  const grantRows = plan
    .filter((item) => ["approved", "revoked"].includes(item.access))
    .map((item) => ({
      signup_id: ids.get(item.email),
      status: "approved",
      source: PREVIEW_FIXTURE_SOURCE,
      approved_at: new Date(base),
      version: 1,
    }));
  const grants =
    await tx`insert into access_grants ${tx(grantRows)} returning id,signup_id`;
  await tx`insert into access_events ${tx(grants.map((row) => ({ grant_id: row.id, action: "approve", source: PREVIEW_FIXTURE_SOURCE, next_status: "approved", grant_version: 1 })))}`;
  const revokedIds = plan
    .filter((item) => item.access === "revoked")
    .map((item) => ids.get(item.email));
  const revoked =
    await tx`update access_grants set status='revoked',revoked_at=now(),updated_at=now(),version=2 where signup_id in ${tx(revokedIds)} returning id`;
  await tx`insert into access_events ${tx(revoked.map((row) => ({ grant_id: row.id, action: "revoke", source: PREVIEW_FIXTURE_SOURCE, previous_status: "approved", next_status: "revoked", grant_version: 2 })))}`;
  const referrals = plan
    .filter((item) => item.referral)
    .map((item) => ids.get(item.email));
  const referrer = ids.get(plan[0].email);
  await tx`update waitlist_signups set referred_by=${referrer} where id in ${tx(referrals)}`;
  await tx`insert into point_events ${tx(referrals.map((id) => ({ signup_id: referrer, referral_signup_id: id, points: 1, reason: "referral_verified" })))}`;
  return {
    existing: 0,
    created: created.length,
    planned: 150,
    canonicalUsersCreated: 0,
    adminGrantsCreated: 0,
    outboxEventsCreated: 0,
  };
}
