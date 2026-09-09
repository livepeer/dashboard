import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth0", () => ({
  auth0: { middleware: vi.fn(), getSession: vi.fn() },
}));
vi.mock("@/lib/console/dev-mock", () => ({ devMockResponse: vi.fn() }));
import { auth0 } from "@/lib/auth0";
import { devMockResponse } from "@/lib/console/dev-mock";
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CONSOLE_DEV_MOCK", "0");
  vi.mocked(auth0.middleware).mockImplementation(async () => {
    const response = NextResponse.next();
    response.cookies.set("auth-fixture", "test-value");
    return response;
  });
  vi.mocked(auth0.getSession).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["/", "/install"])(
  "redirects signed-out %s to login and preserves auth cookies",
  async (path) => {
    const response = await proxy(
      new NextRequest(`https://console.example.invalid${path}`)
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain(
      "auth-fixture=test-value"
    );
  }
);

it("passes Auth0 logout through without treating it as a page", async () => {
  const response = await proxy(
    new NextRequest("https://console.example.invalid/auth/logout")
  );
  expect(auth0.middleware).toHaveBeenCalledTimes(1);
  expect(response.headers.get("set-cookie")).toContain(
    "auth-fixture=test-value"
  );
  expect(auth0.getSession).not.toHaveBeenCalled();
});

it("does not enable development auth fixtures in production", async () => {
  vi.stubEnv("CONSOLE_DEV_MOCK", "1");
  const response = await proxy(
    new NextRequest("https://console.example.invalid/install")
  );
  expect(devMockResponse).not.toHaveBeenCalled();
  expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
});

it("serves development fixtures before Auth0 when explicitly enabled", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CONSOLE_DEV_MOCK", "1");
  vi.mocked(devMockResponse).mockReturnValue(
    NextResponse.json({ fixture: true })
  );
  const response = await proxy(
    new NextRequest("https://console.example.invalid/auth/profile")
  );
  expect(await response.json()).toEqual({ fixture: true });
  expect(auth0.middleware).not.toHaveBeenCalled();
});
