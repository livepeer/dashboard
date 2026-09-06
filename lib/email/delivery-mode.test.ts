import { afterEach, describe, expect, it, vi } from "vitest";
import { isCaptureDelivery } from "./delivery-mode";

afterEach(() => vi.unstubAllEnvs());
describe("preview delivery isolation", () => {
  it.each([undefined, "send", "typo"])(
    "rejects unsafe preview mode %s",
    (mode) => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("EMAIL_DELIVERY_MODE", mode);
      expect(() => isCaptureDelivery()).toThrow(
        "Preview delivery is not isolated"
      );
      expect(() => isCaptureDelivery("newsletter")).toThrow();
    }
  );
  it("keeps newsletter synchronization captured even with live transactional mail", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "send_transactional");
    expect(isCaptureDelivery()).toBe(false);
    expect(isCaptureDelivery("newsletter")).toBe(true);
  });
  it("does not change production delivery", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "capture");
    expect(isCaptureDelivery()).toBe(false);
    expect(isCaptureDelivery("newsletter")).toBe(false);
    expect(
      isCaptureDelivery("email", "preview-001@preview.livepeer.invalid")
    ).toBe(false);
  });
  it("captures only the reserved fixture domain in transactional preview mode", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "send_transactional");
    expect(
      isCaptureDelivery("email", "preview-001@preview.livepeer.invalid")
    ).toBe(true);
    expect(
      isCaptureDelivery("email", " PREVIEW-001@PREVIEW.LIVEPEER.INVALID ")
    ).toBe(true);
    expect(isCaptureDelivery("email", "person@example.com")).toBe(false);
    expect(
      isCaptureDelivery("email", "person@preview.livepeer.invalid.example.com")
    ).toBe(false);
  });
});
