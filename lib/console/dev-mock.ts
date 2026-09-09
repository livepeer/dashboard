/**
 * Dev-only fixture layer for designing auth-gated console surfaces without
 * PymtHouse credentials or a completed Auth0 login.
 *
 * Enabled by `CONSOLE_DEV_MOCK=1` in `.env.local`; hard-disabled when
 * `NODE_ENV === "production"` so it can never answer a deployed request.
 * The proxy short-circuits to these payloads before `auth0.middleware()`
 * runs, so no Auth0 secret is needed to reach the view.
 *
 * Delete this file (and the guard in `proxy.ts`) once real credentials
 * are in place.
 */

import type {
  AccountUsageDailyPipelineRow,
  AccountUsagePayload,
  AccountUsagePipelineRow,
} from "@/lib/console/account-usage";
import type {
  JsonValue,
  RunDetail,
  RunInputSchema,
  RunSummary,
} from "@/lib/runs/types";

const PERIOD_DAYS = 30;
const MOCK_SUB = "google-oauth2|108451209377712345678";
const MOCK_EMAIL = "design@livepeer.org";
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const MOCK_OWNER = {
  principalId: "eu_devmock",
  userId: MOCK_USER_ID,
  externalAccountId: "account_devmock",
};

const MOCK_ASSET_PATHS: Record<string, string> = {
  asset_dev_video: "/media-2026-08-08-150247/crab-beach.mp4",
  asset_user_upload_forest_reference:
    "/livepeer-ui-2026-08-08/network/network-8.webp",
  asset_platform_forest_mask: "/images/console/explore/depth-anything-v2.webp",
  asset_dev_image: "/images/console/explore/flux-schnell.webp",
  asset_dev_keyframes_video: "/media-2026-08-08-141651/capabilities.mp4",
  asset_platform_station_first:
    "/livepeer-ui-2026-08-08/network/network-3.webp",
  asset_platform_station_middle:
    "/livepeer-ui-2026-08-08/network/network-5.webp",
  asset_platform_station_last:
    "/livepeer-ui-2026-08-08/network/network-11.webp",
  asset_user_upload_product_walkthrough: "/media-2026-08-08-141651/crab.mp4",
};

function mockRunSummaries(): RunSummary[] {
  const now = Date.now();
  return [
    {
      ...MOCK_OWNER,
      id: "run_dev_video",
      gatewayRequestId: "job_dev_video",
      providerRequestId: "fal_dev_video",
      provider: "fal",
      source: "mcp",
      capability: "fal-ai/kling-video/v2.1/master/image-to-video",
      modelId: "fal-ai/kling-video/v2.1/master/image-to-video",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 4 * 60_000).toISOString(),
      updatedAt: new Date(now - 3 * 60_000).toISOString(),
      startedAt: new Date(now - 4 * 60_000).toISOString(),
      completedAt: new Date(now - 3 * 60_000).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_image",
      gatewayRequestId: "job_dev_image",
      providerRequestId: "fal_dev_image",
      provider: "fal",
      source: "mcp",
      capability: "fal-ai/flux/schnell",
      modelId: "fal-ai/flux/schnell",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 18 * 60_000).toISOString(),
      updatedAt: new Date(now - 18 * 60_000 + 1_840).toISOString(),
      startedAt: new Date(now - 18 * 60_000).toISOString(),
      completedAt: new Date(now - 18 * 60_000 + 1_840).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_keyframes",
      gatewayRequestId: "job_dev_keyframes",
      providerRequestId: "fal_dev_keyframes",
      provider: "fal",
      source: "mcp",
      capability: "livepeer-example/fal-flux-3-keyframes",
      modelId: "livepeer-example/fal-flux-3-keyframes",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 32 * 60_000).toISOString(),
      updatedAt: new Date(now - 31 * 60_000).toISOString(),
      startedAt: new Date(now - 32 * 60_000).toISOString(),
      completedAt: new Date(now - 31 * 60_000).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_transcript",
      gatewayRequestId: "job_dev_transcript",
      providerRequestId: "fal_dev_transcript",
      provider: "fal",
      source: "mcp",
      capability: "livepeer-example/fal-whisper-transcribe",
      modelId: "livepeer-example/fal-whisper-transcribe",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 46 * 60_000).toISOString(),
      updatedAt: new Date(now - 46 * 60_000 + 7_260).toISOString(),
      startedAt: new Date(now - 46 * 60_000).toISOString(),
      completedAt: new Date(now - 46 * 60_000 + 7_260).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_metadata",
      gatewayRequestId: "job_dev_metadata",
      providerRequestId: "fal_dev_metadata",
      provider: "fal",
      source: "mcp",
      capability: "livepeer-example/fal-ffmpeg-metadata",
      modelId: "livepeer-example/fal-ffmpeg-metadata",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 63 * 60_000).toISOString(),
      updatedAt: new Date(now - 63 * 60_000 + 940).toISOString(),
      startedAt: new Date(now - 63 * 60_000).toISOString(),
      completedAt: new Date(now - 63 * 60_000 + 940).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_3d",
      gatewayRequestId: "job_dev_3d",
      providerRequestId: "fal_dev_3d",
      provider: "fal",
      source: "mcp",
      capability: "livepeer-example/fal-tripo-h31-t3d",
      modelId: "livepeer-example/fal-tripo-h31-t3d",
      endpoint: null,
      status: "succeeded",
      captureVersion: 1,
      errorCode: null,
      errorMessage: null,
      version: 2,
      createdAt: new Date(now - 78 * 60_000).toISOString(),
      updatedAt: new Date(now - 77 * 60_000).toISOString(),
      startedAt: new Date(now - 78 * 60_000).toISOString(),
      completedAt: new Date(now - 77 * 60_000).toISOString(),
      email: MOCK_EMAIL,
    },
    {
      ...MOCK_OWNER,
      id: "run_dev_failed",
      gatewayRequestId: "job_dev_failed",
      providerRequestId: null,
      provider: "fal",
      source: "mcp",
      capability: "fal-ai/minimax/video-01",
      modelId: "fal-ai/minimax/video-01",
      endpoint: null,
      status: "failed",
      captureVersion: 1,
      errorCode: "inference_failed",
      errorMessage: "The preview provider rejected this sample request.",
      version: 2,
      createdAt: new Date(now - 96 * 60_000).toISOString(),
      updatedAt: new Date(now - 95 * 60_000).toISOString(),
      startedAt: new Date(now - 96 * 60_000).toISOString(),
      completedAt: new Date(now - 95 * 60_000).toISOString(),
      email: MOCK_EMAIL,
    },
  ];
}

function mockRunDetail(run: RunSummary): RunDetail {
  const video = run.id === "run_dev_video";
  const image = run.id === "run_dev_image";
  const assetUrl = (id: string) =>
    `https://earlyaccess.livepeer.org/api/assets/${id}`;

  let inputs: Record<string, JsonValue>;
  let resultValue: JsonValue;
  let assets: RunDetail["assets"] = [];
  let feeUsdMicros = "4200";

  if (video) {
    const outputId = "asset_dev_video";
    const referenceId = "asset_user_upload_forest_reference";
    const maskId = "asset_platform_forest_mask";
    inputs = {
      prompt:
        "Create a cinematic tracking shot that begins low among wet ferns in a dense bioluminescent forest at blue hour. The camera should move forward at a deliberate walking pace, then rise gently as translucent plants illuminate in sequence along the path. Keep the atmosphere humid and dimensional, with soft particulate drifting through narrow shafts of moonlight. Introduce a solitary figure only as a distant silhouette for scale; they should never become the focal point. Preserve natural parallax between the foreground leaves, tree trunks, and hazy background, and finish on a wide reveal of a quiet luminous valley. The motion should feel physically grounded, continuous, and suitable for a premium science-fiction nature documentary.",
      negative_prompt:
        "visible text, subtitles, logos, watermarks, abrupt camera shake, fast cuts, warped anatomy, duplicated plants, oversaturated neon colors, crushed shadows, flicker, temporal smearing, or a synthetic game-engine appearance",
      image_url: assetUrl(referenceId),
      mask_url: assetUrl(maskId),
      duration: "5",
      aspect_ratio: "16:9",
      generate_audio: false,
    };
    resultValue = {
      video: { url: assetUrl(outputId), content_type: "video/mp4" },
      inference_time_ms: 58_240,
    };
    assets = [
      mockAsset(run, outputId, "video", "Bioluminescent valley.mp4"),
      mockAsset(run, referenceId, "image", "Forest reference.webp"),
      mockAsset(run, maskId, "image", "Forest subject mask.webp"),
    ];
    feeUsdMicros = "84200";
  } else if (image) {
    const outputId = "asset_dev_image";
    inputs = {
      prompt: "A red lighthouse above a quiet geometric sea",
      image_size: "landscape_16_9",
      num_images: 1,
      seed: 42,
    };
    resultValue = {
      images: [{ url: assetUrl(outputId), width: 1536, height: 864 }],
      seed: 42,
      inference_time_ms: 1_840,
    };
    assets = [mockAsset(run, outputId, "image", "Red lighthouse.webp")];
    feeUsdMicros = "9600";
  } else if (run.id === "run_dev_keyframes") {
    const outputId = "asset_dev_keyframes_video";
    const firstFrameId = "asset_platform_station_first";
    const middleFrameId = "asset_platform_station_middle";
    const lastFrameId = "asset_platform_station_last";
    inputs = {
      keyframes: [
        {
          timestamp_seconds: 0,
          image_url: assetUrl(firstFrameId),
          prompt:
            "Begin on a still, symmetrical wide shot of the empty train platform before sunrise, with cool mist held close to the tracks.",
        },
        {
          timestamp_seconds: 3.5,
          image_url: assetUrl(middleFrameId),
          prompt:
            "A silver train enters from the right while the camera eases backward; preserve the station geometry and introduce warm window light gradually.",
        },
        {
          timestamp_seconds: 7,
          image_url: assetUrl(lastFrameId),
          prompt:
            "Resolve on the departing rear carriage disappearing into fog, leaving the platform unchanged and the camera completely settled.",
        },
      ],
      interpolation: { easing: "ease_in_out", motion_strength: 0.65 },
      fps: 24,
      loop: false,
    };
    resultValue = {
      video_url: assetUrl(outputId),
      frame_count: 168,
      inference_time_ms: 71_330,
    };
    assets = [
      mockAsset(run, outputId, "video", "Train platform transition.mp4"),
      mockAsset(run, firstFrameId, "image", "Empty station at dawn.webp"),
      mockAsset(run, middleFrameId, "image", "Train entering station.webp"),
      mockAsset(run, lastFrameId, "image", "Train departing into fog.webp"),
    ];
    feeUsdMicros = "112600";
  } else if (run.id === "run_dev_transcript") {
    const audioId = "asset_user_upload_interview_audio";
    inputs = {
      audio_url: assetUrl(audioId),
      language: null,
      diarize: true,
      timestamp_granularity: "word",
      batch_size: 16,
    };
    resultValue = {
      text: "Welcome back. Today we are looking at how a generated scene changes when motion direction is specified independently from camera movement.",
      language: "en",
      speakers: ["SPEAKER_00", "SPEAKER_01"],
      segments: [
        { speaker: "SPEAKER_00", start: 0, end: 3.84, text: "Welcome back." },
        {
          speaker: "SPEAKER_01",
          start: 4.12,
          end: 11.76,
          text: "Today we are looking at how a generated scene changes when motion direction is specified independently from camera movement.",
        },
      ],
      inference_time_ms: 7_260,
    };
    assets = [mockAsset(run, audioId, "audio", "Interview recording.mp3")];
    feeUsdMicros = "5800";
  } else if (run.id === "run_dev_metadata") {
    const sourceId = "asset_user_upload_product_walkthrough";
    inputs = {
      video_url: assetUrl(sourceId),
      include_streams: true,
      include_format: true,
    };
    resultValue = {
      format: {
        duration_seconds: 12.48,
        size_bytes: 18_642_901,
        bit_rate: 11_950_578,
        format_names: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
      },
      streams: [
        {
          index: 0,
          type: "video",
          codec: "h264",
          width: 1920,
          height: 1080,
          frame_rate: "24000/1001",
        },
        {
          index: 1,
          type: "audio",
          codec: "aac",
          channels: 2,
          sample_rate_hz: 48_000,
        },
      ],
      processing_duration_ms: 940,
    };
    assets = [mockAsset(run, sourceId, "video", "Product walkthrough.mp4")];
    feeUsdMicros = "1100";
  } else if (run.id === "run_dev_3d") {
    const modelId = "asset_dev_3d_glb";
    const textureId = "asset_dev_3d_texture";
    const previewId = "asset_dev_3d_preview";
    inputs = {
      prompt:
        "A museum-ready ceramic fox figurine with a softly faceted silhouette, hand-painted cobalt botanical details, a stable flat base, and clean watertight topology suitable for close product renders.",
      negative_prompt:
        "thin unsupported parts, holes, floating geometry, text, logos, asymmetrical eyes, low-resolution textures",
      topology: "quad",
      target_face_count: 24_000,
      generate_texture: true,
      texture_resolution: "2048",
    };
    resultValue = {
      model: { url: assetUrl(modelId), format: "glb" },
      textures: [{ url: assetUrl(textureId), channel: "base_color" }],
      preview_image: { url: assetUrl(previewId) },
      polygon_count: 23_842,
      inference_time_ms: 84_910,
    };
    assets = [
      mockAsset(run, modelId, "model/gltf-binary", "Ceramic fox.glb"),
      mockAsset(run, textureId, "image/png", "Ceramic fox texture.png"),
      mockAsset(run, previewId, "image/png", "Ceramic fox preview.png"),
    ];
    feeUsdMicros = "126400";
  } else {
    inputs = {
      prompt: "A glass sculpture rotating in a dark studio",
      duration: "5",
    };
    resultValue = { error: "content_policy_rejection", retryable: false };
  }

  return {
    ...run,
    inputSchema: mockInputSchema(run),
    submittedArguments: {
      capability: run.capability,
      inputs,
    },
    result: { value: resultValue },
    captureRedactedPaths: [],
    assets,
    events: [
      {
        id: `${run.id}_created`,
        eventKey: "created",
        status: "queued",
        createdAt: run.createdAt,
        metadata: {},
      },
      {
        id: `${run.id}_usage`,
        eventKey: `usage:evt_${run.id}`,
        status: run.status,
        createdAt: run.completedAt ?? run.updatedAt,
        metadata: {
          kind: "billing_usage",
          eventId: `evt_${run.id}`,
          networkFeeUsdMicros: feeUsdMicros,
        },
      },
      {
        id: `${run.id}_returned`,
        eventKey: "dispatch-returned",
        status: run.status,
        createdAt: run.completedAt ?? run.updatedAt,
        metadata: { providerStatus: run.status.toUpperCase() },
      },
    ],
  };
}

function mockInputSchema(run: RunSummary): RunInputSchema | null {
  if (run.id === "run_dev_image") {
    return {
      endpointId: "fal-ai/flux/schnell",
      schemaSha256: "dev-fixture",
      fields: [
        {
          path: "prompt",
          title: "Prompt",
          description: "The prompt to generate an image from.",
          required: true,
          types: ["string"],
          options: [],
        },
        {
          path: "image_size",
          title: "Image Size",
          description: "The size of the generated image.",
          required: false,
          types: ["object", "string"],
          options: [
            "square_hd",
            "square",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9",
          ],
          defaultValue: "landscape_4_3",
        },
        {
          path: "image_size.width",
          title: "Width",
          description: "The width of the generated image.",
          required: false,
          types: ["integer"],
          options: [],
        },
        {
          path: "image_size.height",
          title: "Height",
          description: "The height of the generated image.",
          required: false,
          types: ["integer"],
          options: [],
        },
        {
          path: "num_images",
          title: "Num Images",
          description: "The number of images to generate.",
          required: false,
          types: ["integer"],
          options: [],
          minimum: 1,
          maximum: 4,
          defaultValue: 1,
        },
        {
          path: "seed",
          title: "Seed",
          description:
            "The same seed and prompt produce the same image with this model version.",
          required: false,
          types: ["integer", "null"],
          options: [],
        },
      ],
    };
  }
  return null;
}

function mockAsset(
  run: RunSummary,
  id: string,
  mediaType: string,
  displayName: string
): RunDetail["assets"][number] {
  const createdAt = run.completedAt ?? run.updatedAt;
  const expiresAt = new Date(
    Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  return {
    id,
    displayName,
    url: `https://earlyaccess.livepeer.org/api/assets/${id}`,
    mediaType,
    providerRequestId: run.providerRequestId,
    availableUntil: null,
    expiresAt,
    unavailableAt: null,
    hiddenAt: null,
    createdAt,
  };
}

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
  if (pathname.startsWith("/api/assets/")) {
    const id = decodeURIComponent(pathname.slice("/api/assets/".length));
    const target = MOCK_ASSET_PATHS[id];
    if (target) {
      return new Response(null, {
        status: 307,
        headers: { location: new URL(target, requestUrl).toString() },
      });
    }
  }

  if (pathname === "/api/console/session") {
    return json({
      userId: MOCK_USER_ID,
      externalUserId: "eu_devmock",
      name: "Design Preview",
      email: MOCK_EMAIL,
      provider: "google",
      isAdmin: true,
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

  if (pathname === "/api/admin/access") {
    const state = search.get("state") ?? "waiting";
    const fixtures = {
      approved: [
        ["alex@livepeer.org", "2026-07-18T14:22:00.000Z"],
        ["samira@daydream.live", "2026-08-02T09:14:00.000Z"],
      ],
      waiting: [
        ["jordan@studio.example", "2026-09-08T13:41:00.000Z"],
        ["maya@video.example", "2026-09-07T18:09:00.000Z"],
        ["devon@creative.example", "2026-09-06T11:32:00.000Z"],
      ],
      subscribed: [["newsletter@stream.example", "2026-09-04T17:04:00.000Z"]],
      unverified: [["pending@creator.example", "2026-09-08T15:18:00.000Z"]],
    } as const;
    const rows = fixtures[state as keyof typeof fixtures] ?? fixtures.waiting;
    return json({
      rows: rows.map(([email, joinedAt], index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        email,
        waitlistStatus: state === "unverified" ? "pending" : "confirmed",
        accessState: state === "approved" ? "approved" : "pending",
        joinedAt,
        userId: null,
        newsletterSubscribed: state === "subscribed",
      })),
      total: rows.length,
      page: 1,
      pageSize: 50,
    });
  }

  if (pathname === "/api/admin/team") {
    return json({
      members: [
        {
          grantId: "00000000-0000-4000-8000-000000000201",
          signupId: "00000000-0000-4000-8000-000000000301",
          email: MOCK_EMAIL,
          grantedAt: "2026-06-12T12:00:00.000Z",
          isCurrentUser: true,
        },
        {
          grantId: "00000000-0000-4000-8000-000000000202",
          signupId: "00000000-0000-4000-8000-000000000302",
          email: "operations@livepeer.org",
          grantedAt: "2026-07-03T15:30:00.000Z",
          isCurrentUser: false,
        },
        {
          grantId: "00000000-0000-4000-8000-000000000203",
          signupId: "00000000-0000-4000-8000-000000000303",
          email: "studio@livepeer.org",
          grantedAt: "2026-08-21T09:10:00.000Z",
          isCurrentUser: false,
        },
      ],
    });
  }

  if (pathname === "/api/admin/runs") {
    return json({
      items: [],
      nextCursor: null,
      counts: {
        total: 0,
        succeeded: 0,
        failed: 0,
        queued: 0,
        running: 0,
        unknown: 0,
        cancelled: 0,
      },
    });
  }

  if (pathname === "/api/console/runs") {
    const query = search.get("search")?.trim().toLowerCase();
    const items = mockRunSummaries().filter(
      (run) =>
        !query ||
        run.capability.toLowerCase().includes(query) ||
        run.gatewayRequestId.toLowerCase().includes(query)
    );
    return json({
      items,
      nextCursor: null,
      counts: {
        total: items.length,
        succeeded: items.filter((run) => run.status === "succeeded").length,
        failed: items.filter((run) => run.status === "failed").length,
        queued: 0,
        running: 0,
        unknown: 0,
        cancelled: 0,
      },
    });
  }

  if (pathname.startsWith("/api/console/runs/")) {
    const id = decodeURIComponent(pathname.slice("/api/console/runs/".length));
    const run = mockRunSummaries().find((item) => item.id === id);
    return run
      ? json(mockRunDetail(run))
      : json({ error: "run_not_found" }, 404);
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
