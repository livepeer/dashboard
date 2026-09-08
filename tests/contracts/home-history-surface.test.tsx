// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CallsSection from "@/components/console/CallsSection";
import type { RunSummary } from "@/lib/runs/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/console/AuthContext", () => ({
  useAuth: () => ({
    isConnected: true,
    user: { canonicalUserId: "user", id: "external" },
  }),
}));
vi.mock("@/components/console/CallDetailDrawer", () => ({
  default: () => null,
}));
const records: RunSummary[] = [];
const fetcher = vi.fn();
beforeEach(() => {
  records.length = 0;
  fetcher.mockReset();
  fetcher.mockImplementation(async (input: string) => {
    if (input.startsWith("/api/console/runs"))
      return Response.json({ items: records, nextCursor: null });
    // Billing may contain data, but it must never create another displayed history feed.
    return Response.json({
      items: [
        {
          eventId: "legacy-event",
          gatewayRequestId: "legacy-job",
          time: "2025-01-01T00:00:00Z",
          pipeline: "text-generation",
          modelId: "legacy-only-model",
          networkFeeUsdMicros: "100",
        },
      ],
      nextCursor: null,
      openMeterConfigured: true,
    });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders exactly one History and one empty state, without the billing feed", async () => {
  render(<CallsSection query="" onQueryChange={vi.fn()} />);
  await screen.findByText("No history yet.");
  expect(screen.getAllByRole("heading", { name: "History" })).toHaveLength(1);
  expect(
    screen.getAllByRole("region", { name: "History records" })
  ).toHaveLength(1);
  expect(screen.queryByText("Usage-only history")).toBeNull();
  expect(screen.queryByText("No additional usage records.")).toBeNull();
  expect(screen.queryByText("legacy-only-model")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows Postgres rows even when billing is unavailable", async () => {
  records.push({
    id: "saved-run",
    principalId: "external",
    userId: "user",
    externalAccountId: "account",
    gatewayRequestId: "gateway",
    providerRequestId: null,
    provider: null,
    source: "mcp",
    capability: "text-generation",
    modelId: "saved-model",
    endpoint: null,
    status: "succeeded",
    captureVersion: 1,
    errorCode: null,
    errorMessage: null,
    version: 2,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:01Z",
    startedAt: "2026-09-01T12:00:00Z",
    completedAt: "2026-09-01T12:00:01Z",
    email: null,
  });
  fetcher.mockImplementation(async (input: string) =>
    input.startsWith("/api/console/runs")
      ? Response.json({ items: records, nextCursor: null })
      : Response.json({ error: "billing unavailable" }, { status: 503 })
  );
  render(<CallsSection query="" onQueryChange={vi.fn()} />);
  await screen.findByRole("button", { name: "Inspect saved-run" });
  expect(screen.queryByText("No history yet.")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Usage-only history")).toBeNull();
});

it("joins a correlated ticket fee onto the saved run, without adding a billing row", async () => {
  records.push({
    id: "saved-run",
    principalId: "external",
    userId: "user",
    externalAccountId: "account",
    gatewayRequestId: "job_saved",
    providerRequestId: null,
    provider: null,
    source: "mcp",
    capability: "text-generation",
    modelId: "saved-model",
    endpoint: null,
    status: "succeeded",
    captureVersion: 1,
    errorCode: null,
    errorMessage: null,
    version: 2,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:01Z",
    startedAt: "2026-09-01T12:00:00Z",
    completedAt: "2026-09-01T12:00:01Z",
    email: null,
  });
  fetcher.mockImplementation(async (input: string) => {
    if (input.startsWith("/api/console/runs"))
      return Response.json({ items: records, nextCursor: null });
    return Response.json({
      items: [
        {
          eventId: "evt-saved",
          gatewayRequestId: "job_saved",
          time: "2026-09-01T12:00:00Z",
          clientId: "app_test",
          externalUserId: "eu_test",
          pipeline: "text-generation",
          modelId: "saved-model",
          networkFeeUsdMicros: "1000",
        },
        {
          eventId: "legacy-event",
          gatewayRequestId: "legacy-job",
          time: "2025-01-01T00:00:00Z",
          clientId: "app_test",
          externalUserId: "eu_test",
          pipeline: "text-generation",
          modelId: "legacy-only-model",
          networkFeeUsdMicros: "100",
        },
      ],
      nextCursor: null,
      openMeterConfigured: true,
    });
  });
  render(<CallsSection query="" onQueryChange={vi.fn()} />);
  await screen.findByRole("button", { name: "Inspect saved-run" });
  expect(screen.getByText("$0.0010")).toBeTruthy();
  expect(screen.queryByText("legacy-only-model")).toBeNull();
});

it("searches the same Postgres history rather than a separate loaded billing list", async () => {
  render(<CallsSection query="flux" onQueryChange={vi.fn()} />);
  await screen.findByText("No history matches this search.");
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/console/runs?limit=50&search=flux"),
      expect.anything()
    )
  );
  expect(screen.queryByText("No loaded usage matches this search.")).toBeNull();
});
