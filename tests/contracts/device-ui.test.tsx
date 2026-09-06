// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ButtonHTMLAttributes } from "react";
vi.mock("@/components/design-system/Button", () => ({
  default: ({
    children,
    disabled,
    onClick,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/console/ConsolePageHeader", () => ({
  default: () => null,
}));
import DeviceApproveForm from "@/app/(app)/device/DeviceApproveForm";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("device approval transport recovery", () => {
  it.each(["network", "non-json"])(
    "recovers from %s and permits a safe retry",
    async (mode) => {
      const fetcher = vi.fn();
      if (mode === "network")
        fetcher.mockRejectedValueOnce(new Error("offline"));
      else
        fetcher.mockResolvedValueOnce({
          ok: false,
          json: async () => {
            throw new Error("invalid JSON");
          },
        });
      fetcher.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal("fetch", fetcher);
      render(
        <DeviceApproveForm
          iss="https://issuer.example"
          targetLinkUri="https://console.example/device"
          userCode="SYNTHETIC"
          clientId="fixture"
        />
      );
      fireEvent.click(screen.getByRole("button"));
      await screen.findByRole("alert");
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false
      );
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(screen.getByText(/Device approved/)).toBeDefined()
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );
});
