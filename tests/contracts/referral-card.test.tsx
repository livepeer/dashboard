// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReferralCard } from "@/components/console/ReferralCard";
import { AccountAvatar } from "@/components/console/auth/AccountAvatar";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(toast.success, { error: toast.error }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("copies the supplied referral URL", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <ReferralCard referralUrl="https://preview.example.com/waitlist?ref=real-code" />
  );
  expect(screen.getByRole("button").className).toContain("bg-card");
  expect(screen.getByRole("button").className).toContain("border-border");
  expect(screen.getByRole("button").getAttribute("style")).toBeNull();
  expect(
    screen.getByRole("button").querySelector("img")?.getAttribute("src")
  ).toBe("/images/console/explore/nomic-embed.webp");
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy referral link" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect(writeText).toHaveBeenCalledWith(
    "https://preview.example.com/waitlist?ref=real-code"
  );
});
it("disables copying when no trusted referral URL is available", () => {
  render(<ReferralCard referralUrl={null} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});
it("reports clipboard errors without claiming success", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(
    <ReferralCard referralUrl="https://preview.example.com/waitlist?ref=code" />
  );
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(toast.success).not.toHaveBeenCalled();
});

it("falls back to the account initial when the profile photo fails", () => {
  render(
    <AccountAvatar
      email="person@example.com"
      avatarUrl="https://images.example.com/avatar.png"
    />
  );
  fireEvent.error(screen.getByRole("img", { name: "Your profile picture" }));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByLabelText("Profile avatar").textContent).toBe("P");
});
