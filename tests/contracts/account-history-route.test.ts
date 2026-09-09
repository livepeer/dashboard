import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/console/session-user", () => ({
  requireConsoleSession: vi.fn(),
  SessionRequiredError: class extends Error {},
}));
vi.mock("@/lib/console/pymthouse-bff", () => ({
  fetchAccountRequestsForExternalUser: vi.fn(),
}));
vi.mock("@/lib/console/activity-assets", () => ({
  attachOutputsToTickets: vi.fn(),
}));
vi.mock("@/lib/external-accounts/service", () => ({
  configuredPymthouseScope: () => ({ appId: "app-fixture" }),
}));
vi.mock("@/lib/runs/store", () => ({
  resolveRunOwner: vi.fn(),
  recordRunUsage: vi.fn(),
  existingRunGatewayIds: vi.fn(),
}));
import { GET } from "@/app/api/pymthouse/account-requests/route";
import { requireConsoleSession } from "@/lib/console/session-user";
import { fetchAccountRequestsForExternalUser } from "@/lib/console/pymthouse-bff";
import { attachOutputsToTickets } from "@/lib/console/activity-assets";
import {
  existingRunGatewayIds,
  recordRunUsage,
  resolveRunOwner,
} from "@/lib/runs/store";
import type {
  AccountRequestsPayload,
  SignedTicketRequestRow,
} from "@/lib/console/account-usage";

const owner = {
  principalId: "eu_fixture",
  userId: "user-fixture",
  externalAccountId: "account-fixture",
};
const row = (gatewayRequestId: string): SignedTicketRequestRow => ({
  gatewayRequestId,
  eventId: `event-${gatewayRequestId}`,
  externalUserId: "eu_fixture",
  clientId: "app-fixture",
  time: "2020-01-01T00:00:00Z",
  networkFeeUsdMicros: "100",
  feeWei: "10",
  ethUsdPrice: "2000.25",
  pixels: "512",
  pipeline: "image",
  modelId: "model",
});
const payload = (
  items: SignedTicketRequestRow[],
  nextCursor: string | null
): AccountRequestsPayload => ({
  items,
  nextCursor,
  externalUserId: "eu_fixture",
  clientId: "app-fixture",
  openMeterConfigured: true,
});
const request = () =>
  new NextRequest(
    "http://localhost/api/pymthouse/account-requests?cursor=start&limit=10"
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireConsoleSession).mockResolvedValue({
    canonicalUserId: "user-fixture",
    externalUserId: "eu_fixture",
    email: "fixture@example.invalid",
  } as never);
  vi.mocked(resolveRunOwner).mockResolvedValue(owner);
  vi.mocked(recordRunUsage).mockResolvedValue(undefined);
  vi.mocked(existingRunGatewayIds).mockResolvedValue([]);
  vi.mocked(attachOutputsToTickets).mockImplementation(
    async (_principal, items) => items
  );
});

it("suppresses owned run tickets, persists fee-only evidence, and joins assets on unmatched legacy rows", async () => {
  const ticket = {
    ...row("owned"),
    prompt: "never-save-private-payload",
    arbitrary: { secret: "never-save" },
  };
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload([ticket, row("legacy")], "continue")
  );
  vi.mocked(existingRunGatewayIds).mockResolvedValue(["owned"]);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(
    (await response.json()).items.map(
      (item: SignedTicketRequestRow) => item.gatewayRequestId
    )
  ).toEqual(["legacy"]);
  expect(recordRunUsage).toHaveBeenCalledWith(
    owner,
    expect.arrayContaining([
      {
        eventId: "event-owned",
        gatewayRequestId: "owned",
        metadata: {
          networkFeeUsdMicros: "100",
          feeWei: "10",
          ethUsdPrice: "2000.25",
          pixels: "512",
        },
      },
    ])
  );
  expect(JSON.stringify(vi.mocked(recordRunUsage).mock.calls)).not.toContain(
    "never-save"
  );
  expect(attachOutputsToTickets).toHaveBeenCalledWith("eu_fixture", [
    row("legacy"),
  ]);
});

it("looks up Cost by gateway request id without walking usage pages", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload([row("owned"), row("noise")], null)
  );
  const response = await GET(
    new NextRequest(
      "http://localhost/api/pymthouse/account-requests?includeCorrelated=1&gatewayRequestId=owned"
    )
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.items).toEqual([row("owned")]);
  expect(result.nextCursor).toBeNull();
  expect(fetchAccountRequestsForExternalUser).toHaveBeenCalledTimes(1);
  expect(fetchAccountRequestsForExternalUser).toHaveBeenCalledWith({
    externalUserId: "eu_fixture",
    email: "fixture@example.invalid",
    limit: 50,
    gatewayRequestIds: ["owned"],
  });
  expect(recordRunUsage).toHaveBeenCalledTimes(1);
});

it("rejects gatewayRequestId unless includeCorrelated is enabled", async () => {
  const response = await GET(
    new NextRequest(
      "http://localhost/api/pymthouse/account-requests?gatewayRequestId=owned"
    )
  );
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "gatewayRequestId requires includeCorrelated=1",
  });
  expect(fetchAccountRequestsForExternalUser).not.toHaveBeenCalled();
  expect(recordRunUsage).not.toHaveBeenCalled();
});

it("falls back to paged live usage when by-id misses the first page", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser)
    .mockResolvedValueOnce(payload([row("noise")], "next-page"))
    .mockResolvedValueOnce(payload([row("owned")], null));
  const response = await GET(
    new NextRequest(
      "http://localhost/api/pymthouse/account-requests?includeCorrelated=1&gatewayRequestId=owned"
    )
  );
  expect(response.status).toBe(200);
  expect((await response.json()).items).toEqual([row("owned")]);
  expect(fetchAccountRequestsForExternalUser).toHaveBeenNthCalledWith(1, {
    externalUserId: "eu_fixture",
    email: "fixture@example.invalid",
    limit: 50,
    gatewayRequestIds: ["owned"],
  });
  expect(fetchAccountRequestsForExternalUser).toHaveBeenNthCalledWith(2, {
    externalUserId: "eu_fixture",
    email: "fixture@example.invalid",
    cursor: "next-page",
    limit: 50,
  });
});

it("caps an overflowing gatewayRequestId list instead of 400ing Cost", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `job_${i}`);
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload(ids.map(row), null)
  );
  const url = new URL("http://localhost/api/pymthouse/account-requests");
  url.searchParams.set("includeCorrelated", "1");
  for (const id of ids) url.searchParams.append("gatewayRequestId", id);
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(200);
  expect(fetchAccountRequestsForExternalUser).toHaveBeenCalledWith({
    externalUserId: "eu_fixture",
    email: "fixture@example.invalid",
    limit: 50,
    gatewayRequestIds: ids.slice(0, 50),
  });
});

it("returns scoped matched receipts when Home explicitly requests correlation", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload(
      [row("owned"), { ...row("other"), externalUserId: "eu_other" }],
      "next"
    )
  );
  vi.mocked(existingRunGatewayIds).mockResolvedValue(["owned"]);
  const response = await GET(
    new NextRequest(
      "http://localhost/api/pymthouse/account-requests?includeCorrelated=1"
    )
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.items).toEqual([row("owned")]);
  expect(result.nextCursor).toBe("next");
  expect(recordRunUsage).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(recordRunUsage).mock.calls)).not.toContain(
    "event-other"
  );
});

it("walks entirely matched pages until legacy results using actual upstream continuation", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser)
    .mockResolvedValueOnce(payload([row("owned-1")], "second"))
    .mockResolvedValueOnce(payload([row("owned-2")], "third"))
    .mockResolvedValueOnce(payload([row("legacy")], "fourth"));
  vi.mocked(existingRunGatewayIds)
    .mockResolvedValueOnce(["owned-1"])
    .mockResolvedValueOnce(["owned-2"])
    .mockResolvedValueOnce([]);
  const result = await (await GET(request())).json();
  expect(result.items).toEqual([row("legacy")]);
  expect(result.nextCursor).toBe("fourth");
  expect(
    vi
      .mocked(fetchAccountRequestsForExternalUser)
      .mock.calls.map(([input]) => input.cursor)
  ).toEqual(["start", "second", "third"]);
  expect(recordRunUsage).toHaveBeenCalledTimes(3);
});

it("caps matched-page scanning at five and preserves continuation even with no visible rows", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockImplementation(async () =>
    payload(
      [row("owned")],
      `next-${vi.mocked(fetchAccountRequestsForExternalUser).mock.calls.length}`
    )
  );
  vi.mocked(existingRunGatewayIds).mockResolvedValue(["owned"]);
  const result = await (await GET(request())).json();
  expect(result.items).toEqual([]);
  expect(result.nextCursor).toBe("next-5");
  expect(fetchAccountRequestsForExternalUser).toHaveBeenCalledTimes(5);
});

it("stops on the actual upstream end even when every row is correlated", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload([row("owned")], null)
  );
  vi.mocked(existingRunGatewayIds).mockResolvedValue(["owned"]);
  expect(await (await GET(request())).json()).toMatchObject({
    items: [],
    nextCursor: null,
  });
  expect(fetchAccountRequestsForExternalUser).toHaveBeenCalledTimes(1);
});

it.each(["mismatch", "missing"])(
  "does not fetch or persist billing when canonical owner is %s",
  async (kind) => {
    if (kind === "mismatch")
      vi.mocked(resolveRunOwner).mockResolvedValue({
        ...owner,
        userId: "other-user",
      });
    else
      vi.mocked(resolveRunOwner).mockRejectedValue(
        new Error("run_owner_unresolved")
      );
    expect((await GET(request())).status).toBe(503);
    expect(fetchAccountRequestsForExternalUser).not.toHaveBeenCalled();
    expect(recordRunUsage).not.toHaveBeenCalled();
  }
);

it("does not persist or expose cross-owner ticket rows", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue(
    payload(
      [{ ...row("other"), externalUserId: "eu_other" }, row("legacy")],
      null
    )
  );
  const result = await (await GET(request())).json();
  expect(result.items).toEqual([row("legacy")]);
  expect(JSON.stringify(vi.mocked(recordRunUsage).mock.calls)).not.toContain(
    "event-other"
  );
});

it("fails closed on a cross-account payload envelope", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockResolvedValue({
    ...payload([row("other")], null),
    externalUserId: "eu_other",
  });
  expect((await GET(request())).status).toBe(503);
  expect(recordRunUsage).not.toHaveBeenCalled();
});

it("returns an independent billing error without creating fabricated execution history", async () => {
  vi.mocked(fetchAccountRequestsForExternalUser).mockRejectedValue(
    new Error("billing unavailable")
  );
  expect((await GET(request())).status).toBe(502);
  expect(recordRunUsage).not.toHaveBeenCalled();
  expect(attachOutputsToTickets).not.toHaveBeenCalled();
});
