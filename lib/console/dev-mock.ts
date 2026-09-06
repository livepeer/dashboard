/**
 * Dev-only fixture layer for designing auth-gated console surfaces without
 * PymtHouse credentials or a completed Auth0 login.
 *
 * Enabled by `CONSOLE_DEV_MOCK=1` in `.env.local`; hard-disabled when
 * `NODE_ENV === "production"` so it can never answer a deployed request.
 * Middleware short-circuits to these payloads before `auth0.middleware()`
 * runs, so no Auth0 secret is needed to reach the view.
 *
 * Delete this file (and the guard in `middleware.ts`) once real credentials
 * are in place.
 */

import type {
  AccountUsageDailyPipelineRow,
  AccountUsagePayload,
  AccountUsagePipelineRow,
} from "@/lib/console/account-usage";

const PERIOD_DAYS = 30;
const MOCK_SUB = "google-oauth2|108451209377712345678";
const MOCK_EMAIL = "design@livepeer.org";

/** Deterministic PRNG — charts must not reshuffle on every reload. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function usd(dollars: number): string {
  return Math.round(dollars * 1_000_000).toString();
}

function money(dollars: number) {
  return {
    usdMicros: usd(dollars),
    usd: dollars.toFixed(2),
    currency: "USD",
  };
}

function dayKeys(end: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/** Capability mix mirrors the Explore catalog so names read realistically. */
const CAPABILITIES: Array<{
  pipeline: string;
  modelId: string;
  /** Mean daily requests; the curve is shaped around this. */
  base: number;
  /** Network fee per request, USD. */
  unit: number;
  /** Growth over the period — 1 = flat, >1 = trending up. */
  trend: number;
}> = [
  {
    pipeline: "live-video-to-video",
    modelId: "daydream-video",
    base: 1180,
    unit: 0.006,
    trend: 1.9,
  },
  {
    pipeline: "text-to-image",
    modelId: "flux-schnell",
    base: 640,
    unit: 0.003,
    trend: 1.15,
  },
  {
    pipeline: "transcoding",
    modelId: "frameworks-transcoding",
    base: 410,
    unit: 0.005,
    trend: 0.85,
  },
  {
    pipeline: "text-to-image",
    modelId: "sdxl-turbo",
    base: 220,
    unit: 0.004,
    trend: 1.0,
  },
  {
    pipeline: "fixed",
    modelId: "livepeer-example/fal-gpt-image-2",
    base: 160,
    unit: 0.004,
    trend: 1.2,
  },
  {
    pipeline: "hour",
    modelId: "livepeer-example/comfyui-stream",
    base: 40,
    unit: 0.012,
    trend: 0.9,
  },
  {
    pipeline: "image-to-video",
    modelId: "stable-video-diffusion",
    base: 90,
    unit: 0.021,
    trend: 1.35,
  },
  {
    pipeline: "text-generation",
    modelId: "qwen3-32b",
    base: 48,
    unit: 0.002,
    trend: 1.1,
  },
];

function buildUsage(
  periodDays: number,
  includePrior: boolean
): AccountUsagePayload {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (periodDays - 1));
  const priorEnd = new Date(start);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (periodDays - 1));

  const keys = dayKeys(end, periodDays);
  const rand = seeded(0x5eed);

  const pipelineModels: AccountUsagePipelineRow[] = [];
  const dailyByPipeline: AccountUsageDailyPipelineRow[] = [];
  const prior: AccountUsagePipelineRow[] = [];
  let totalRequests = 0;
  let totalNetworkFee = 0;
  let totalBillable = 0;
  let priorTotalRequests = 0;

  for (const cap of CAPABILITIES) {
    const dailyRequests: number[] = [];
    for (let i = 0; i < periodDays; i++) {
      const progress = periodDays === 1 ? 1 : i / (periodDays - 1);
      const growth = 1 + (cap.trend - 1) * progress;
      // Weekday rhythm + jitter, so the area chart has believable texture.
      const weekday = new Date(keys[i] + "T00:00:00Z").getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1;
      const jitter = 0.78 + rand() * 0.44;
      dailyRequests.push(
        Math.max(0, Math.round(cap.base * growth * weekend * jitter))
      );
    }

    const requestCount = dailyRequests.reduce((a, b) => a + b, 0);
    const networkFee = requestCount * cap.unit;
    const billable = networkFee * 1.18;
    totalRequests += requestCount;
    totalNetworkFee += networkFee;
    totalBillable += billable;

    pipelineModels.push({
      pipeline: cap.pipeline,
      modelId: cap.modelId,
      requestCount,
      networkFeeUsdMicros: usd(networkFee),
      endUserBillableUsdMicros: usd(billable),
      dailyRequests,
    });

    keys.forEach((date, i) => {
      dailyByPipeline.push({
        pipeline: cap.pipeline,
        modelId: cap.modelId,
        date,
        requestCount: dailyRequests[i],
        networkFeeUsdMicros: usd(dailyRequests[i] * cap.unit),
      });
    });

    if (includePrior) {
      // Prior period sits below current for anything trending up.
      const priorCount = Math.round(requestCount / (0.72 + cap.trend * 0.22));
      priorTotalRequests += priorCount;
      prior.push({
        pipeline: cap.pipeline,
        modelId: cap.modelId,
        requestCount: priorCount,
        networkFeeUsdMicros: usd(priorCount * cap.unit),
        endUserBillableUsdMicros: usd(priorCount * cap.unit * 1.18),
        dailyRequests: [],
      });
    }
  }

  return {
    clientId: "app_dev_mock_console",
    period: { start: start.toISOString(), end: end.toISOString() },
    periodDayKeys: keys,
    priorPeriod: {
      start: priorStart.toISOString(),
      end: priorEnd.toISOString(),
    },
    balance: {
      externalUserId: "eu_devmock",
      balanceUsdMicros: usd(42.5),
      consumedUsdMicros: usd(totalNetworkFee),
      lifetimeGrantedUsdMicros: usd(150),
      hasAccess: true,
    },
    current: {
      requestCount: totalRequests,
      networkFeeUsdMicros: usd(totalNetworkFee),
      endUserBillableUsdMicros: usd(totalBillable),
      pipelineModels,
      dailyByPipeline,
    },
    prior: {
      requestCount: priorTotalRequests,
      pipelineModels: prior,
    },
  };
}

function devRedirect(path: string | null, requestUrl: string): Response {
  const safePath =
    path?.startsWith("/") && !path.startsWith("//") ? path : "/home";
  const baseUrl = process.env.APP_BASE_URL || requestUrl;

  return new Response(null, {
    status: 307,
    headers: { location: new URL(safePath, baseUrl).toString() },
  });
}

const INCLUDED_TOTAL_USD = 250;

function buildWallet() {
  const resetsAt = new Date();
  resetsAt.setUTCDate(resetsAt.getUTCDate() + 11);
  const consumed = 0;
  const remaining = INCLUDED_TOTAL_USD;

  return {
    clientId: "app_dev_mock_console",
    balance: {
      usdMicros: usd(42.5),
      usd: "42.50",
      lifetimeGrantedUsdMicros: usd(150),
      consumedUsdMicros: usd(107.5),
    },
    paymentMethod: { hasDefault: true },
    billingState: {
      asOf: new Date().toISOString(),
      subject: {
        type: "owner" as const,
        externalUserId: "eu_devmock",
        billingMode: "owner_rollup" as const,
      },
      status: "active" as const,
      canSpend: true,
      reason: null,
      funding: {
        prepaid: money(42.5),
        included: money(remaining),
        spendable: money(42.5 + remaining),
        overage: {
          eligible: true,
          ceiling: money(500),
          unbilledDebt: money(18.24),
          remaining: money(481.76),
          utilizationBps: 365,
          debtSource: "gathering_invoice" as const,
        },
        // builder-sdk 0.6.x omits this from BillingState; the API sends it.
        includedUsage: {
          total: {
            usdMicros: usd(INCLUDED_TOTAL_USD),
            usd: INCLUDED_TOTAL_USD.toFixed(2),
          },
          remaining: { usdMicros: usd(remaining), usd: remaining.toFixed(2) },
          consumed: { usdMicros: usd(consumed), usd: consumed.toFixed(2) },
          resetsAt: resetsAt.toISOString(),
          sourcePlan: { id: "plan_scale", name: "Scale", type: "subscription" },
        },
      },
      collection: {
        mode: "progressive_invoice" as const,
        collector: "settlement_connect" as const,
        paymentMethod: { hasDefault: true, brand: "visa", last4: "4242" },
        nextAction: "none" as const,
        leadThreshold: money(50),
        minimumCharge: money(0.5),
        cycle: "monthly",
        collectionInterval: "day",
        lastRaisedAt: null,
        nextRaiseEligibleAt: null,
      },
      explain: {
        headline: "Spending from included usage",
        detail:
          "Included usage covers requests until it runs out, then prepaid balance, then metered overage up to your ceiling.",
        docsUrl: "https://docs.livepeer.org/console/billing",
      },
    },
    payPerUsePlans: [
      {
        planId: "plan_payg",
        planName: "Pay as you go",
        chargeThresholdUsdMicros: usd(50),
        resolvedBehavior: "charge_threshold",
      },
    ],
  };
}

const PLANS = [
  {
    id: "plan_free",
    name: "Free",
    type: "subscription",
    status: "active",
    priceAmount: "0",
    priceCurrency: "USD",
    billingCycle: "monthly",
    includedUsdMicros: usd(5),
    chargeThresholdUsdMicros: null,
    resolvedBehavior: "block",
    capabilityCount: 12,
    isStarterDefault: true,
  },
  {
    id: "plan_scale",
    name: "Scale",
    type: "subscription",
    status: "active",
    priceAmount: "99",
    priceCurrency: "USD",
    billingCycle: "monthly",
    includedUsdMicros: usd(INCLUDED_TOTAL_USD),
    chargeThresholdUsdMicros: usd(500),
    resolvedBehavior: "overage",
    capabilityCount: 28,
    isStarterDefault: false,
  },
  {
    id: "plan_enterprise",
    name: "Enterprise",
    type: "subscription",
    status: "active",
    priceAmount: "0",
    priceCurrency: "USD",
    billingCycle: null,
    includedUsdMicros: null,
    chargeThresholdUsdMicros: null,
    resolvedBehavior: "custom",
    capabilityCount: 28,
    isStarterDefault: false,
  },
];

function buildSubscription() {
  const periodEnd = new Date();
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 11);
  const minEffectiveAt = new Date().toISOString();
  const timing = {
    minEffectiveAt,
    maxEffectiveAt: periodEnd.toISOString(),
    presets: ["immediate", "next_billing_cycle"] as Array<
      "immediate" | "next_billing_cycle"
    >,
  };
  return {
    planId: "plan_scale",
    planName: "Scale",
    status: "active",
    subscriptionId: "sub_devmock",
    currentPeriodEnd: periodEnd.toISOString(),
    timingOptions: { cancel: timing, change: timing },
    pendingCancel: null,
  };
}

function buildInvoices() {
  const items = [0, 1, 2].map((i) => {
    const issued = new Date();
    issued.setUTCMonth(issued.getUTCMonth() - i);
    const periodStart = new Date(issued);
    periodStart.setUTCDate(1);
    return {
      id: `in_devmock_${i}`,
      number: `LP-2026-00${4 - i}`,
      status: i === 0 ? "open" : "paid",
      currency: "USD",
      totalAmount: i === 0 ? "18.24" : (99 + i * 12.5).toFixed(2),
      issuedAt: issued.toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: issued.toISOString(),
      invoiceType: i === 0 ? "gathering" : "subscription",
    };
  });
  return { items, nextCursor: null };
}

/**
 * Per-request rows for the Calls section on /home.
 *
 * Drawn from the same CAPABILITIES mix as the usage totals so the two halves
 * of the page agree with each other: the capability that dominates Spend by
 * capability is also the one that dominates the call list under it. Weighted
 * by `base` for the same reason.
 */
function buildRequests(limit: number, cursor: string | null) {
  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  // 7 days at one call every 30 minutes — enough pages to exercise loadMore.
  const STEP_MINUTES = 30;
  const TOTAL = Math.ceil((7 * 24 * 60) / STEP_MINUTES);
  const rand = seeded(0x5ca11 + offset);

  // Pick capabilities in proportion to their daily volume.
  const weights = CAPABILITIES.map((c) => c.base);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let r = rand() * totalWeight;
    for (let i = 0; i < CAPABILITIES.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return CAPABILITIES[i]!;
    }
    return CAPABILITIES[0]!;
  };

  const count = Math.min(limit, TOTAL - offset);
  const items = Array.from({ length: Math.max(0, count) }, (_, i) => {
    const index = offset + i;
    const cap = pick();
    // Walk backwards from now across the 7-day history window.
    const minutesAgo = index * STEP_MINUTES + Math.floor(rand() * 8);
    const fee = Math.round(cap.unit * (0.7 + rand() * 0.6) * 1_000_000);
    return {
      time: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      clientId: "cli_devmock",
      appName: "Livepeer Agent",
      externalUserId: "eu_devmock",
      gatewayRequestId: `req_${(0x100000 + index * 7919).toString(16)}`,
      pipeline: cap.pipeline,
      modelId: cap.modelId,
      networkFeeUsdMicros: String(fee),
      eventId: `evt_${index}`,
    };
  });

  const next = offset + items.length;
  return {
    items,
    nextCursor: next < TOTAL ? String(next) : null,
    openMeterConfigured: true,
    clientId: "cli_devmock",
    externalUserId: "eu_devmock",
  };
}

/**
 * Returns a fixture response for the console's auth + PymtHouse endpoints,
 * or null to let the request fall through to the real handler.
 */
export function devMockResponse(
  pathname: string,
  search: URLSearchParams,
  requestUrl: string
): Response | null {
  if (pathname === "/api/console/session") {
    return json({
      userId: "00000000-0000-4000-8000-000000000001",
      externalUserId: "eu_devmock",
      name: "Design Preview",
      email: MOCK_EMAIL,
      provider: "google",
      isAdmin: false,
    });
  }
  // Auth0's client `useUser()` reads this; a body here makes the app "signed in".
  if (pathname === "/auth/profile") {
    return json({
      sub: MOCK_SUB,
      name: "Design Preview",
      nickname: "design",
      email: MOCK_EMAIL,
      email_verified: true,
      picture: "",
      updated_at: new Date().toISOString(),
    });
  }

  // Logging out of a fake session would bounce to a real Auth0 tenant.
  if (pathname === "/auth/logout" || pathname === "/auth/login") {
    return devRedirect(search.get("returnTo"), requestUrl);
  }

  if (pathname === "/api/pymthouse/account-usage") {
    const rawDays = Number.parseInt(search.get("days") ?? "", 10);
    const periodDays =
      Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 90
        ? rawDays
        : PERIOD_DAYS;
    const includePrior = !["0", "false", "no"].includes(
      (search.get("includePrior") ?? "1").toLowerCase()
    );
    return json(buildUsage(periodDays, includePrior));
  }

  if (pathname === "/api/pymthouse/account-requests") {
    const rawLimit = Number.parseInt(search.get("limit") ?? "", 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 200
        ? rawLimit
        : 50;
    return json(buildRequests(limit, search.get("cursor")));
  }

  if (pathname === "/api/pymthouse/wallet") return json(buildWallet());
  if (pathname === "/api/pymthouse/wallet/invoices")
    return json(buildInvoices());
  if (pathname === "/api/pymthouse/wallet/payment-methods") {
    return json({
      paymentMethods: [
        {
          id: "pm_devmock",
          type: "card",
          brand: "visa",
          last4: "4242",
          expMonth: 4,
          expYear: 2029,
          isDefault: true,
        },
      ],
    });
  }
  if (pathname === "/api/pymthouse/plans") return json({ plans: PLANS });
  if (pathname === "/api/pymthouse/subscription") {
    return json({ subscription: buildSubscription() });
  }

  return null;
}
