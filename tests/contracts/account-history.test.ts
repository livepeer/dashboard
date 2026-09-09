import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/console/pymthouse-http", () => ({
  issuerOriginFromConfig: () => "https://billing.example.invalid",
  readPublicClientId: () => "test-app",
  requirePymthouseM2mConfig: () => ({}),
}));
vi.mock("@pymthouse/builder-sdk", () => ({
  PmtHouseClient: class {
    async mintUserAccessToken() {
      return { access_token: "test-token" };
    }
  },
  PmtHouseError: class extends Error {},
  getUtcCalendarMonthIsoBounds: vi.fn(),
}));

import { fetchAccountRequestsForExternalUser } from "@/lib/console/pymthouse-bff";

afterEach(() => vi.unstubAllGlobals());

it("keeps old history and pagination even when its media is unavailable", async () => {
  const items = [
    {
      time: "2020-01-01T12:00:00.000Z",
      clientId: "test-app",
      externalUserId: "test-user",
      gatewayRequestId: "old-request",
      pipeline: "text-to-image",
      modelId: "test-model",
      networkFeeUsdMicros: "10",
      eventId: "old-event",
      outputUrl: null,
    },
  ];
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      items,
      nextCursor: "older-page",
      openMeterConfigured: true,
    })
  );
  vi.stubGlobal("fetch", fetch);
  const result = await fetchAccountRequestsForExternalUser({
    externalUserId: "test-user",
    cursor: "current-page",
    limit: 50,
  });
  expect(result.items).toEqual(items);
  expect(result.nextCursor).toBe("older-page");
  const url = new URL(fetch.mock.calls[0][0] as string);
  expect(url.pathname).toBe("/api/v1/apps/test-app/me/usage/requests");
  const from = url.searchParams.get("from");
  expect(from).toBeTruthy();
  expect(from).not.toBe("1970-01-01T00:00:00.000Z");
  const fromMs = Date.parse(from ?? "");
  const toMs = Date.parse(url.searchParams.get("to") ?? "");
  expect(Number.isFinite(fromMs)).toBe(true);
  expect(Number.isFinite(toMs)).toBe(true);
  expect(toMs - fromMs).toBeLessThanOrEqual(365 * 24 * 60 * 60 * 1000);
  expect(url.searchParams.get("cursor")).toBe("current-page");
  expect(url.searchParams.get("limit")).toBe("50");
});

it("asks PymtHouse for the signed-ticket rows by gateway request id", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      items: [],
      nextCursor: null,
      openMeterConfigured: true,
    })
  );
  vi.stubGlobal("fetch", fetch);
  await fetchAccountRequestsForExternalUser({
    externalUserId: "test-user",
    limit: 50,
    gatewayRequestIds: ["job_saved", "job_other"],
  });
  const url = new URL(fetch.mock.calls[0][0] as string);
  expect(url.pathname).toBe("/api/v1/apps/test-app/me/usage/requests");
  expect(url.searchParams.getAll("gatewayRequestId")).toEqual([
    "job_saved",
    "job_other",
  ]);
  expect(url.searchParams.get("cursor")).toBeNull();
  expect(url.searchParams.get("from")).toBeNull();
  expect(url.searchParams.get("to")).toBeNull();
});

it("caps overflowing gatewayRequestId lists at the usage API limit", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      items: [],
      nextCursor: null,
      openMeterConfigured: true,
    })
  );
  vi.stubGlobal("fetch", fetch);
  const ids = Array.from({ length: 51 }, (_, i) => `job_${i}`);
  await fetchAccountRequestsForExternalUser({
    externalUserId: "test-user",
    limit: 50,
    gatewayRequestIds: ids,
  });
  const url = new URL(fetch.mock.calls[0][0] as string);
  expect(url.pathname).toBe("/api/v1/apps/test-app/me/usage/requests");
  expect(url.searchParams.getAll("gatewayRequestId")).toEqual(ids.slice(0, 50));
});

it("does not label History with media expiry or a seven-day limit", () => {
  const source = readFileSync("components/console/CallsSection.tsx", "utf8");
  expect(source).toContain('title="History"');
  expect(source).not.toMatch(/Last 7 days|expir/i);
});
