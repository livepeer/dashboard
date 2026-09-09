export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";
export type RunOwner = {
  principalId: string;
  userId: string;
  externalAccountId: string;
};
export type CapturedResult = {
  value: JsonValue;
  omitted?: { reason: string; bytes?: number };
  redactedPaths?: string[];
};
export type RunAssetInput = {
  id?: string;
  url: string;
  mediaType?: string | null;
  providerRequestId?: string | null;
  availableUntil?: string | null;
  expiresAt?: string | null;
};
export type RunAsset = RunAssetInput & {
  id: string;
  /** User-facing filename/title when known; history falls back to the asset id. */
  displayName?: string | null;
  createdAt: string;
  unavailableAt: string | null;
  hiddenAt: string | null;
};
export type RunInputFieldSchema = {
  /** Dot path into submitted inputs. Array items use `*`, for example `keyframes.*.image_url`. */
  path: string;
  title: string | null;
  description: string | null;
  required: boolean;
  types: string[];
  options: Array<string | number | boolean | null>;
  defaultValue?: JsonValue;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
};
export type RunInputSchema = {
  endpointId: string;
  schemaSha256: string;
  fields: RunInputFieldSchema[];
};
export type RunRecord = RunOwner & {
  id: string;
  gatewayRequestId: string;
  providerRequestId: string | null;
  provider: string | null;
  source: string;
  capability: string;
  modelId: string | null;
  endpoint: string | null;
  status: RunStatus;
  submittedArguments: Record<string, JsonValue> | null;
  result: CapturedResult | null;
  captureVersion: number;
  captureRedactedPaths: string[];
  errorCode: string | null;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  email: string | null;
};
export type RunDetail = RunRecord & {
  /** Current provider metadata used to explain submitted inputs in user history. */
  inputSchema?: RunInputSchema | null;
  assets: RunAsset[];
  events: {
    id: string;
    eventKey: string;
    status: RunStatus;
    createdAt: string;
    metadata: Record<string, JsonValue>;
  }[];
};
export type CreateRunInput = {
  id?: string;
  gatewayRequestId: string;
  capability: string;
  modelId?: string;
  endpoint?: string;
  submittedArguments: Record<string, JsonValue>;
  captureVersion?: number;
  captureRedactedPaths?: string[];
};
export type RunQueue = { statusUrl: string; resultUrl: string };
export type RunTransition = {
  eventKey: string;
  status: RunStatus;
  expectedVersion?: number;
  provider?: string;
  providerRequestId?: string;
  result?: CapturedResult;
  errorCode?: string | null;
  errorMessage?: string | null;
  assets?: RunAssetInput[];
  queue?: RunQueue;
  /** Stop recovery against an obsolete or unsupported final receipt. */
  stopReconciliation?: string;
  reconciliationLease?: { jobId: string; leaseToken: string };
  metadata?: Record<string, JsonValue>;
};
export type RunListQuery = {
  cursor?: string;
  limit?: number;
  status?: RunStatus;
  search?: string;
};
export type RunSummary = Omit<
  RunRecord,
  "submittedArguments" | "result" | "captureRedactedPaths"
>;
export type RunPage = {
  items: RunSummary[];
  nextCursor: string | null;
  counts: Record<RunStatus | "total", number>;
};
export type ReconciliationJob = {
  id: string;
  runId: string;
  owner: RunOwner;
  leaseToken: string;
  attempts: number;
  deadlineAt: string;
  queue: RunQueue;
};
