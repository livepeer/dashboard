// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({ connected: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/components/console/AuthContext", () => ({
  useAuth: () => ({ isConnected: fixture.connected }),
}));
vi.mock("@/lib/console/useAccountUsage", () => ({
  SESSION_USAGE_OPTIONS: { includePrior: false },
  useAccountUsage: () => ({
    status: "ready",
    data: {
      balance: {
        externalUserId: "session-user",
        balanceUsdMicros: "4982000",
        lifetimeGrantedUsdMicros: "5000000",
        consumedUsdMicros: "18000",
        hasAccess: true,
      },
    },
  }),
}));
vi.mock("@/lib/console/session-user", () => ({
  requireConsoleSession: vi.fn(),
  SessionRequiredError: class extends Error {
    status = 401;
    code = "unauthorized";
  },
}));
vi.mock("@/lib/console/pymthouse-bff", () => ({
  fetchAccountUsageForExternalUser: vi.fn(),
}));

import SidebarUsageCard from "@/components/console/SidebarUsageCard";
import { GET } from "@/app/api/pymthouse/account-usage/route";
import {
  requireConsoleSession,
  SessionRequiredError,
} from "@/lib/console/session-user";
import { fetchAccountUsageForExternalUser } from "@/lib/console/pymthouse-bff";

beforeEach(() => {
  fixture.connected = true;
  vi.resetAllMocks();
});
afterEach(cleanup);

it("shows the session allowance in the sidebar", () => {
  render(<SidebarUsageCard />);
  expect(
    screen.getByRole("link", {
      name: "Balance: $4.98 remaining of $5.00 issued",
    })
  ).toBeTruthy();
});

it("hides the sidebar meter after sign-out even if a previous balance exists", () => {
  fixture.connected = false;
  const { container } = render(<SidebarUsageCard />);
  expect(container.textContent).toBe("");
});

it("rejects signed-out account usage before contacting billing", async () => {
  vi.mocked(requireConsoleSession).mockRejectedValue(
    new SessionRequiredError()
  );
  const response = await GET(
    new NextRequest("http://localhost/api/pymthouse/account-usage")
  );
  expect(response.status).toBe(401);
  expect(fetchAccountUsageForExternalUser).not.toHaveBeenCalled();
});

it("fetches only the authenticated user's allowance with prior usage disabled", async () => {
  vi.mocked(requireConsoleSession).mockResolvedValue({
    externalUserId: "session-user",
  } as never);
  vi.mocked(fetchAccountUsageForExternalUser).mockResolvedValue({
    balance: { externalUserId: "session-user" },
  } as never);
  const response = await GET(
    new NextRequest(
      "http://localhost/api/pymthouse/account-usage?includePrior=0&externalUserId=other-user"
    )
  );
  expect(response.status).toBe(200);
  expect(fetchAccountUsageForExternalUser).toHaveBeenCalledWith({
    externalUserId: "session-user",
    periodDays: 30,
    window: "rolling",
    includePrior: false,
  });
});
