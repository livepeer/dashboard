// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import CallsTable from "@/components/console/CallsTable";
import type { AccountActivityRow } from "@/lib/console/types";
import type { RunDetail, RunSummary } from "@/lib/runs/types";

vi.mock("@/components/console/AuthContext", () => ({
  useAuth: () => ({
    isConnected: true,
    user: {
      canonicalUserId: "admin-user",
      id: "admin-external",
      isAdmin: true,
    },
  }),
}));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);
const records: RunSummary[] = ["alex", "jamie"].map((name, index) => ({
  id: `run-${name}`,
  principalId: `eu_${name}`,
  userId: `user-${name}`,
  externalAccountId: `account-${name}`,
  gatewayRequestId: `job-${name}`,
  providerRequestId: null,
  provider: "fal",
  source: "mcp",
  capability: "fal-ai/flux/schnell",
  modelId: "fal-ai/flux/schnell",
  endpoint: null,
  status: index === 0 ? "succeeded" : "failed",
  captureVersion: 1,
  errorCode: null,
  errorMessage: null,
  version: 2,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:01.000Z",
  startedAt: "2026-09-01T12:00:00.000Z",
  completedAt: "2026-09-01T12:00:01.000Z",
  email: `${name}@example.invalid`,
}));
const fetcher = vi.fn();
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  fetcher.mockReset();
  fetcher.mockImplementation(async (input: string) => {
    const url = new URL(input, "https://console.example.invalid");
    if (url.pathname.startsWith("/api/admin/runs/")) {
      const row = records.find(
        (record) => record.id === url.pathname.split("/").at(-1)
      );
      if (!row)
        return Response.json({ error: "run_not_found" }, { status: 404 });
      const detail: RunDetail = {
        ...row,
        submittedArguments: {
          capability: row.capability,
          inputs: { prompt: "Durable lighthouse prompt", seed: 42 },
        },
        result: { value: { text: "Captured text output" } },
        captureRedactedPaths: [],
        assets: [],
        events: [],
      };
      return Response.json(detail);
    }
    const search = url.searchParams.get("search")?.toLowerCase();
    const status = url.searchParams.get("status");
    const items = records.filter(
      (record) =>
        (!search || record.email?.includes(search)) &&
        (!status || record.status === status)
    );
    return Response.json({
      items,
      nextCursor: null,
      counts: {
        total: 2,
        succeeded: 1,
        failed: 1,
        queued: 0,
        running: 0,
        unknown: 0,
        cancelled: 0,
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

it("preserves personal History navigation without an admin inspector", () => {
  const row: AccountActivityRow = {
    id: "personal-request",
    environmentId: "sample",
    timestamp: new Date().toISOString(),
    model: "Sample model",
    pipeline: "text-to-image",
    modality: "t2i",
    costDisplay: "$0.01",
    status: "success",
    kind: "batch",
    latencyMs: null,
    durationMs: null,
    signer: "paymthouse",
    signerLabel: "Console",
    tokenId: "sample",
    tokenName: "Sample",
  };
  render(
    <CallsTable
      rows={[row]}
      bordered={false}
      density="cozy"
      variant="requests"
    />
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "/home?request=personal-request"
  );
  expect(screen.queryByRole("button")).toBeNull();
});

it("loads persisted platform history and inspects submitted/returned JSON in the shared drawer", async () => {
  render(
    <AdminWorkspace>
      <div>Existing waitlist</div>
    </AdminWorkspace>
  );
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "History" }));
  await screen.findByRole("button", { name: "Inspect run-alex" });
  expect(
    screen.getByRole("heading", { name: "Platform History" })
  ).toBeTruthy();
  expect(screen.queryByText("Sample data · Not connected")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("Total runs").parentElement?.textContent).toBe(
    "Total runs2"
  );
  fireEvent.click(screen.getByRole("button", { name: "Inspect run-alex" }));
  const inspector = screen.getByRole("dialog");
  await within(inspector).findByText("Submitted JSON");
  await waitFor(() =>
    expect(inspector.textContent).toContain("Durable lighthouse prompt")
  );
  expect(inspector.textContent).toContain("Captured text output");
  expect(within(inspector).getByText("Returned JSON")).toBeTruthy();
  expect(
    fetcher.mock.calls.some(([url]) => url === "/api/admin/runs/run-alex")
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Return to dashboard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("sends email search and status filters to the authenticated API", async () => {
  render(
    <AdminWorkspace>
      <div>Waitlist content</div>
    </AdminWorkspace>
  );
  fireEvent.click(screen.getByRole("tab", { name: "History" }));
  await screen.findByRole("button", { name: "Inspect run-alex" });
  fireEvent.change(screen.getByRole("textbox", { name: "Search runs" }), {
    target: { value: "alex@example.invalid" },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Inspect run-jamie" })
    ).toBeNull()
  );
  await screen.findByRole("button", { name: "Inspect run-alex" });
  const filters = screen.getByRole("group", { name: "Filter runs by status" });
  fireEvent.click(within(filters).getByRole("button", { name: "Failed" }));
  await screen.findByText("No recorded runs match these filters.");
  expect(
    fetcher.mock.calls.some(([value]) => {
      const url = new URL(value, "https://example.invalid");
      return (
        url.searchParams.get("search") === "alex@example.invalid" &&
        url.searchParams.get("status") === "failed"
      );
    })
  ).toBe(true);
});

it("shows a retryable API failure instead of falling back to sample records", async () => {
  fetcher.mockResolvedValue(
    Response.json({ error: "unavailable" }, { status: 503 })
  );
  render(
    <AdminWorkspace>
      <div>Waitlist</div>
    </AdminWorkspace>
  );
  fireEvent.click(screen.getByRole("tab", { name: "History" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Inspect run-/ })).toBeNull();
});

it("supports keyboard tab switching", () => {
  render(
    <AdminWorkspace>
      <div>Existing waitlist</div>
    </AdminWorkspace>
  );
  fireEvent.keyDown(screen.getByRole("tab", { name: "Waitlist" }), {
    key: "ArrowRight",
  });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "History" })
  );
  fireEvent.keyDown(screen.getByRole("tab", { name: "History" }), {
    key: "Home",
  });
  expect(
    screen.getByRole("tab", { name: "Waitlist" }).getAttribute("aria-selected")
  ).toBe("true");
});
