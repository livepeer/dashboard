// ─── Environments ────────────────────────────────────────────────────────────
//
// An Environment is an isolation context inside an organization. API keys, jobs,
// and usage are scoped to one. Two ship by default — Production and Development
// — mirroring the rate-limited "just try it" → real-production progression the
// PymtHouse signer enables. The environment is modeled as a *container* so a
// future Pipeline (the deploy-your-own-capability surface, "App" in Modal terms)
// can hang off it without restructuring this layer.

export type EnvironmentKind = "production" | "development";

export interface Environment {
  id: string;
  /** Display name, e.g. "Production". */
  name: string;
  /** URL-safe slug, e.g. "production". */
  slug: string;
  kind: EnvironmentKind;
  /** The environment selected when none is persisted. Exactly one is default. */
  isDefault?: boolean;
}

// ─── Apps (deployed pipelines) ──────────────────────────────────────────────
//
// There is ONE app type. An app IS a deployed pipeline — the unit a builder
// pushes with the Runner SDK (`livepeer push` against a `livepeer.yaml`,
// identified by `pipelineId`). It is the Livepeer analog of a Modal "App": a
// named, deployed capability that lives inside an Environment. Its deployment /
// pipeline manifest hangs off `app.deployment` (an `AppDeployment`); the
// catalog-facing fields (name, provider, pricing, latency, …) live at the top
// level on `App`. Two transport kinds mirror the SDK's two base classes:
//   - "batch"  → `Pipeline`      (POST /predict, request/response or SSE)
//   - "live"   → `LivePipeline`  (trickle, POST /stream/{start,stop,params})
//
// Visibility is binary and identical to Explore-presence: a "public" deployment
// IS listed in the Explore catalog; a "private" one runs only for its own keys.

export type PipelineKind = "batch" | "live";

export type PipelineStatusKind =
  | "deployed" // running, healthy
  | "building" // image build / deploy in progress
  | "stopped" // deployed then halted
  | "error"; // crashed / failing health checks

export type PipelineVisibility = "private" | "public";

export interface PipelineEndpoint {
  method: string;
  path: string;
  description?: string;
}

/**
 * The pipeline/deployment manifest for an app. Holds everything specific to a
 * single deployed instance — its Runner SDK identity, environment, build, and
 * live operational metrics. Catalog-facing fields (name, provider, pricing,
 * latency, …) live on `App` itself; this is the operator-facing manifest.
 */
export interface AppDeployment {
  /** Runner SDK identifier from livepeer.yaml, e.g. "sentiment". */
  pipelineId: string;
  /** Environment this deployment lives in. */
  environmentId: string;
  kind: PipelineKind;
  status: PipelineStatusKind;
  visibility: PipelineVisibility;
  /** module:class entrypoint from the manifest, e.g. "pipeline:Sentiment". */
  entrypoint: string;
  /** GPU class from the manifest, or null for CPU pipelines. */
  gpu: string | null;
  /** Built image reference. */
  image: string;
  /** Deployed semver-ish version. */
  version: string;
  /** ISO-8601 timestamp of the last deploy. */
  lastDeployedAt: string;
  createdBy: { name: string; initials: string; color: string };
  /** Warm orchestrators currently serving this capability. */
  warmOrchestrators: number;
  calls7d: number;
  p50LatencyMs: number;
  errorRatePct: number;
  /** HTTP surface the orchestrator hits — drives the Overview "Endpoints" list. */
  endpoints: PipelineEndpoint[];
}

/**
 * Transitional alias: an app that definitely carries its deployment manifest.
 * Lets the operator components keep their `app: Pipeline` prop types while the
 * codebase migrates manifest reads to `app.deployment.X`.
 */
export type Pipeline = App & { deployment: AppDeployment };

export type AppCategory =
  | "Video Generation"
  | "Video Editing"
  | "Video Understanding"
  | "Live Transcoding"
  | "Image Generation"
  | "Speech"
  | "Language";

export type AppStatus = "hot" | "cold";

export type PricingUnit = "M Tokens" | "Second" | "Request" | "Minute" | "Step";

export type PlaygroundFieldType =
  | "text"
  | "textarea"
  | "number"
  | "range"
  | "file"
  | "select"
  | "boolean";

export type PlaygroundOutputType =
  | "image"
  | "text"
  | "video"
  | "audio"
  | "json";

export interface PlaygroundField {
  name: string;
  label: string;
  type: PlaygroundFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface PlaygroundConfig {
  fields: PlaygroundField[];
  outputType: PlaygroundOutputType;
  mockOutputUrl?: string;
  mockOutputText?: string;
  /** Realistic mock response for the JSON tab. When provided, the Output's JSON
   *  tab renders this shape instead of the generic `{ status, output, metrics }`
   *  envelope — useful for models whose value IS the structured data (detection
   *  boxes, depth stats, segmentation polygons, etc.). */
  mockOutputJson?: unknown;
  /** Selects the playground UI. "webcam" mocks live video-in/video-out with the user's camera. "transcoding" shapes the output like a Livepeer HLS stream (playbackId, rendition ladder, copyable URLs). Defaults to "form". */
  playgroundVariant?: "form" | "webcam" | "transcoding";
}

export interface UsageDataPoint {
  date: string;
  requests: number;
  cost: number;
}

export interface NetworkStat {
  label: string;
  value: string;
  delta?: string;
  trend: "up" | "down" | "flat";
}

export interface App {
  id: string;
  name: string;
  provider: string;
  category: AppCategory;
  description: string;
  coverImage?: string;
  status: AppStatus;
  pricing: {
    amount: number;
    unit: PricingUnit;
    inputPrice?: number;
    outputPrice?: number;
  };
  latency: number;
  orchestrators: number;
  precision?: string;
  runs7d: number;
  uptime: number;
  featured?: boolean;
  /** Supports streaming (WebRTC) inference in addition to request/response. The differentiator on the network — flagged as a capability pill and filterable on Explore. */
  realtime?: boolean;
  /** ISO-8601 date the model was published on the network. Drives the "NEW" badge and Recently-added sort. */
  releasedAt?: string;
  tags?: string[];
  sla?: {
    uptime: string;
    latencyP99: string;
  };
  apiEndpoint?: string;
  providerUrl?: string;
  networkPrice?: {
    amount: number;
    unit: PricingUnit;
  };
  playgroundConfig?: PlaygroundConfig;
  readme?: string;
  /** The pipeline/deployment manifest. Present once the app is deployed; the
   *  org's own apps and (in the mock) every catalog app carry one. */
  deployment?: AppDeployment;
}

/**
 * Routing scope for an API token. Tokens route requests to:
 *  - "any": any connected payment provider (falls back to free tier)
 *  - a specific SignerKey: only that provider
 * Kept in sync with SignerKey so the dropdown can enumerate providers.
 */
export type ApiKeyScope = "any" | SignerKey;

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked";
  created: string;
  lastUsed: string;
  calls7d: number;
  isDefault?: boolean;
  scope?: ApiKeyScope;
}

export interface SolutionProvider {
  id: string;
  name: string;
  provider: string;
  description: string;
  dashboardUrl: string;
  capabilities: AppCategory[];
  pricingSummary: string;
  trustBadges: ("Managed" | "SLA" | "Enterprise")[];
}

export interface EcosystemApp {
  id: string;
  name: string;
  url: string;
  domain: string;
  description: string;
  categories: string[];
  featured?: boolean;
}

// ─── Stats: GPUs ─────────────────────────────────────────────────────────────

export interface GpuNode {
  name: string;
  count: number;
  memory: string;
  tflops: number;
  maxPower: string;
}

export interface GpuGrowthPoint {
  date: string;
  total: number;
  byType?: Record<string, number>;
}

// ─── Stats: Utilization ──────────────────────────────────────────────────────

export type PipelineStatus = "active" | "degraded" | "cold";

export interface PipelineUtilization {
  id: string;
  name: string;
  warmOrchestrators: number;
  totalCapacity: number;
  utilizationPct: number;
  avgLatencyMs: number;
  status: PipelineStatus;
  price: number;
  priceUnit: string;
}

export type LiveJobStatus = "online" | "degraded" | "completed";

export interface LiveJob {
  id: string;
  pipeline: string;
  model: string;
  fpsIn?: number;
  fpsOut?: number;
  latencyMs?: number;
  age: string;
  status: LiveJobStatus;
}

// ─── Stats: Payments ─────────────────────────────────────────────────────────

export interface PaymentDayData {
  date: string;
  volumeEth: number;
  volumeUsd: number;
}

export interface PaymentStats {
  lastDay: { eth: number; usd: number };
  lastMonth: { eth: number; usd: number };
  allTime: { eth: number; usd: number };
}

export interface PaymentTransaction {
  id: string;
  date: string;
  orchestrator: string;
  pipeline: string;
  amountEth: number;
  amountUsd: number;
  block: number;
  txHash: string;
}

// ─── Settings: Remote Signers & Payment ─────────────────────────────────────

export interface RemoteSigner {
  id: string;
  name: string;
  description: string;
  currencies: string[];
  status: "available" | "coming-soon";
  /** Inline usage shown when this signer is connected (mock). */
  monthlyUsage?: {
    requests: number;
    spentDisplay: string; // e.g. "$4.50", "€3.20", "0.012 ETH"
  };
}

export interface UsageSummary {
  requests: number;
  creditsUsed: number;
  creditsLimit: number | null;
  tier: string;
}

/**
 * Account-wide routing breakdown for the current month.
 * Used on the Billing tab to show where requests are going.
 * Percentages are integers and should sum to ~100.
 */
export interface RoutingSummary {
  totalRequests: number;
  routes: {
    label: string;
    percent: number;
    requests: number;
    color: "green" | "blue" | "neutral";
  }[];
}

// ─── Account Usage (per-account, distinct from network-wide stats) ──────────
//
// Keys here must stay in sync with REMOTE_SIGNERS (by id) and the two
// non-signer sources: the foundation free tier and direct ETH wallet payments.
// `paymthouse` / `livepeerCloud` correspond to REMOTE_SIGNERS ids
// `paymthouse` / `livepeer-cloud`. `coinbase-pay` is omitted until it exits
// coming-soon.

export type SignerKey =
  | "freeTier"
  | "paymthouse"
  | "livepeerCloud"
  | "ethWallet";

export interface AccountUsageSummary {
  requests: number;
  spendDisplay: string;
  freeTierUsed: number;
  freeTierLimit: number;
  freeTierResetIn: string;
}

export interface AccountUsageBySigner {
  signer: SignerKey;
  label: string;
  requests: number;
  percent: number;
  spendDisplay: string;
  color: "green" | "blue" | "neutral" | "violet";
}

export interface AccountUsageByToken {
  tokenId: string;
  tokenName: string;
  requests: number;
  lastUsed: string;
  spendDisplay: string;
}

export interface AccountUsageDailyPoint {
  date: string;
  freeTier: number;
  paymthouse: number;
  livepeerCloud: number;
  ethWallet: number;
}

// "active" = a live session still in progress (streaming now). Batch calls are
// sub-second, so they're only ever terminal.
export type AccountActivityStatus =
  | "active"
  | "success"
  | "failed"
  | "timeout"
  | "queued"
  | "running"
  | "cancelled"
  | "unknown";

export interface AccountActivityRow {
  recordKind?: "run" | "usage";
  gatewayRequestId?: string;
  id: string;
  /** Environment this request ran under. Scopes Jobs + Home runs by env. */
  environmentId: string;
  /** ISO-8601 timestamp; rendered as relative on Home, absolute on UsageTab. */
  timestamp: string;
  model: string;
  pipeline: string;
  /** Capability modality (`t2i`, `i2v`, `realtime`, …). Displayed instead of pipeline. */
  modality: string;
  status: AccountActivityStatus;
  /** Invocation shape: a batch request/response, or a live streaming session. */
  kind: PipelineKind;
  /** null when status !== "success" */
  latencyMs: number | null;
  /** Live session length (ms). null for batch calls — they report latency instead. */
  durationMs: number | null;
  signer: SignerKey;
  signerLabel: string;
  tokenId: string;
  tokenName: string;
  /** Pre-formatted cost string, "—" when failed. */
  costDisplay: string;
  /** Full-precision cost for hover. */
  costExact?: string;
  /** Neon asset URL joined from OpenMeter `gatewayRequestId`. */
  outputUrl?: string;
  /** Upstream provider request id when the asset store has one. */
  providerRequestId?: string;
}

// ─── Stats: Overview ─────────────────────────────────────────────────────────

export interface ApiRequestSeries {
  date: string;
  [apiName: string]: string | number;
}
