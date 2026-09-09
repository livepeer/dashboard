// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";
import CallDetailDrawer from "@/components/console/CallDetailDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccountActivityRow } from "@/lib/console/types";
import type { RunDetail } from "@/lib/runs/types";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const row: AccountActivityRow = {
  id: "run-media",
  recordKind: "run",
  gatewayRequestId: "job-media",
  environmentId: "console",
  timestamp: "2026-09-09T12:00:00.000Z",
  model: "Whisper Transcribe",
  pipeline: "audio-to-text",
  modality: "asr",
  status: "success",
  kind: "batch",
  latencyMs: 1_000,
  durationMs: null,
  signer: "paymthouse",
  signerLabel: "MCP",
  tokenId: "",
  tokenName: "",
  costDisplay: "$0.01",
  providerRequestId: "provider-media",
};

function detail(assets: RunDetail["assets"]): RunDetail {
  return {
    id: row.id,
    principalId: "eu_test",
    userId: "user-test",
    externalAccountId: "account-test",
    gatewayRequestId: row.gatewayRequestId!,
    providerRequestId: row.providerRequestId ?? null,
    provider: "fal",
    source: "mcp",
    capability: "livepeer-example/fal-whisper-transcribe",
    modelId: "livepeer-example/fal-whisper-transcribe",
    endpoint: null,
    status: "succeeded",
    submittedArguments: {
      inputs: {
        audio_url: "https://earlyaccess.livepeer.org/api/assets/asset-audio",
        diarize: true,
      },
    },
    result: {
      value: {
        text: "A transcript must not occupy the media stage.",
        inference_time_ms: 1_000,
      },
    },
    captureVersion: 1,
    captureRedactedPaths: [],
    errorCode: null,
    errorMessage: null,
    version: 1,
    createdAt: "2026-09-09T12:00:00.000Z",
    updatedAt: "2026-09-09T12:00:01.000Z",
    startedAt: "2026-09-09T12:00:00.000Z",
    completedAt: "2026-09-09T12:00:01.000Z",
    email: "test@example.invalid",
    assets,
    events: [],
  };
}

afterEach(cleanup);

function renderWithTooltips(element: ReactElement) {
  return render(<TooltipProvider>{element}</TooltipProvider>);
}

it("never renders JSON or text results in the user media stage", () => {
  renderWithTooltips(
    <CallDetailDrawer
      row={row}
      rows={[row]}
      open
      onClose={() => {}}
      detail={detail([])}
      variant="user"
    />
  );

  expect(screen.getByText("Media unavailable")).toBeTruthy();
  expect(screen.queryByText(/transcript must not occupy/i)).toBeNull();
  expect(screen.getByText("asr").className).toContain("h-[18px]");
  expect(screen.queryByText("Speech to text")).toBeNull();
  expect(screen.queryByText("Modality")).toBeNull();
  expect(screen.getByText("Render status")).toBeTruthy();
  fireEvent.focus(screen.getByRole("button", { name: "About Render status" }));
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Amount of time it took the model to generate your request."
  );
});

it("uses asset media type and shows its expiry countdown", () => {
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  renderWithTooltips(
    <CallDetailDrawer
      row={row}
      rows={[row]}
      open
      onClose={() => {}}
      detail={detail([
        {
          id: "asset-audio",
          url: "https://earlyaccess.livepeer.org/api/assets/asset-audio",
          mediaType: "audio/mpeg",
          providerRequestId: row.providerRequestId ?? null,
          availableUntil: null,
          expiresAt,
          unavailableAt: null,
          hiddenAt: null,
          createdAt: "2026-09-09T12:00:01.000Z",
        },
      ])}
      variant="user"
    />
  );

  expect(document.querySelector("audio")).toBeTruthy();
  expect(
    screen.getByText(/Expires in 00:01:59:5\d|Expires in 00:02:00:00/)
  ).toBeTruthy();
  expect(screen.getByText("Audio")).toBeTruthy();
  fireEvent.focus(screen.getByRole("button", { name: "About Audio" }));
  expect(screen.getByRole("tooltip").textContent).toContain(
    "upload or an earlier platform result"
  );
  expect(screen.getByRole("link", { name: "asset-audio" })).toHaveProperty(
    "target",
    "_blank"
  );
  expect(screen.getByRole("link", { name: "asset-audio" }).className).toContain(
    "text-xs"
  );
  expect(screen.queryByText(/earlyaccess\.livepeer\.org/)).toBeNull();
});

it("keeps every asset in an input array as a compact URL-backed link", () => {
  const run = detail([
    {
      id: "asset-first",
      displayName: "First reference.png",
      url: "https://earlyaccess.livepeer.org/api/assets/asset-first",
      mediaType: "image/png",
      providerRequestId: null,
      availableUntil: null,
      expiresAt: null,
      unavailableAt: null,
      hiddenAt: null,
      createdAt: "2026-09-09T12:00:01.000Z",
    },
    {
      id: "asset-second",
      displayName: "Second reference.png",
      url: "https://earlyaccess.livepeer.org/api/assets/asset-second",
      mediaType: "image/png",
      providerRequestId: null,
      availableUntil: null,
      expiresAt: null,
      unavailableAt: null,
      hiddenAt: null,
      createdAt: "2026-09-09T12:00:01.000Z",
    },
  ]);
  run.submittedArguments = {
    inputs: {
      image_urls: [
        "https://earlyaccess.livepeer.org/api/assets/asset-first",
        "https://earlyaccess.livepeer.org/api/assets/asset-second",
      ],
    },
  };

  renderWithTooltips(
    <CallDetailDrawer
      row={row}
      rows={[row]}
      open
      onClose={() => {}}
      detail={run}
      variant="user"
    />
  );

  for (const name of ["First reference.png", "Second reference.png"]) {
    const link = screen.getByRole("link", { name });
    expect(link).toHaveProperty("target", "_blank");
    expect(link.className).toContain("text-xs");
    expect(link.getAttribute("href")).toContain("/api/assets/asset-");
  }
});

it("groups each keyframe timestamp with its linked asset", () => {
  const run = detail([
    {
      id: "asset-frame",
      displayName: "Train entering station.webp",
      url: "https://earlyaccess.livepeer.org/api/assets/asset-frame",
      mediaType: "image/webp",
      providerRequestId: row.providerRequestId ?? null,
      availableUntil: null,
      expiresAt: null,
      unavailableAt: null,
      hiddenAt: null,
      createdAt: "2026-09-09T12:00:01.000Z",
    },
  ]);
  run.submittedArguments = {
    inputs: {
      keyframes: [
        {
          timestamp_seconds: 3.5,
          image_url: "https://earlyaccess.livepeer.org/api/assets/asset-frame",
        },
      ],
      loop: false,
    },
  };

  renderWithTooltips(
    <CallDetailDrawer
      row={row}
      rows={[row]}
      open
      onClose={() => {}}
      detail={run}
      variant="user"
    />
  );

  expect(screen.getByText("Keyframe 1")).toBeTruthy();
  const timestamp = screen.getByText("00:03");
  const assetLink = screen.getByRole("link", {
    name: "Train entering station.webp",
  });
  expect(assetLink).toHaveProperty("target", "_blank");
  expect(assetLink).toHaveProperty("title", "Train entering station.webp");
  expect(assetLink.className).toContain("text-xs");
  expect(assetLink.querySelector("span")?.className).toContain("truncate");
  expect(timestamp.parentElement).toBe(assetLink.parentElement);
  expect(
    timestamp.compareDocumentPosition(assetLink) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(screen.queryByText("Timestamp Seconds")).toBeNull();
  expect(screen.getByText("false").getAttribute("data-slot")).toBe("badge");
  fireEvent.focus(screen.getByRole("button", { name: "About Loop" }));
  const loopTooltip = screen.getByRole("tooltip");
  expect(loopTooltip.textContent).toContain(
    "Makes the video repeat continuously. When set to true, the final frame transitions back to the first"
  );
  expect(loopTooltip.querySelector('[aria-label="Options"]')).toBeTruthy();
  expect(screen.getAllByText("true").at(-1)?.getAttribute("data-slot")).toBe(
    "badge"
  );
  expect(screen.getAllByText("false").at(-1)?.getAttribute("data-slot")).toBe(
    "badge"
  );
});

it("shows Flux Schnell image-size alternatives", () => {
  const run = detail([]);
  run.submittedArguments = {
    inputs: { image_size: "landscape_16_9" },
  };
  run.inputSchema = {
    endpointId: "fal-ai/flux/schnell",
    schemaSha256: "fixture",
    fields: [
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
        description: "Custom output width.",
        required: false,
        types: ["integer"],
        options: [],
      },
      {
        path: "image_size.height",
        title: "Height",
        description: "Custom output height.",
        required: false,
        types: ["integer"],
        options: [],
      },
    ],
  };

  renderWithTooltips(
    <CallDetailDrawer
      row={{ ...row, model: "Flux Schnell", modality: "t2i" }}
      rows={[row]}
      open
      onClose={() => {}}
      detail={run}
      variant="user"
    />
  );

  fireEvent.focus(screen.getByRole("button", { name: "About Image Size" }));
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toContain("portrait_16_9");
  expect(tooltip.textContent).toContain("landscape_16_9");
  expect(
    Array.from(tooltip.querySelectorAll('[data-slot="badge"]')).map(
      (badge) => badge.textContent
    )
  ).toEqual([
    "square_hd",
    "square",
    "portrait_4_3",
    "portrait_16_9",
    "landscape_4_3",
    "landscape_16_9",
  ]);
  expect(screen.getByRole("tooltip").textContent).toContain(
    "custom width and height"
  );
});
