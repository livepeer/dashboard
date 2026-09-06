import { describe, expect, it } from "vitest";

import { getDatabaseUrl, getEnv } from "./env";

const validProductionEnv = {
  NODE_ENV: "production" as const,
  DATABASE_URL: "postgresql://user:password@db.example.com/waitlist",
  ATTRIBUTION_HASH_SECRET: "a".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://waitlist.example.com",
  RESEND_API_KEY: "re_example",
  EMAIL_FROM: "Livepeer Waitlist <waitlist@example.com>",
  INTERNAL_OUTBOX_SECRET: "o".repeat(32),
};

describe("server environment validation", () => {
  it("allows inert email config only in explicitly capture-only previews", () => {
    const source = {
      ...validProductionEnv,
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
      VERCEL_ENV: "preview",
      EMAIL_DELIVERY_MODE: "capture",
    };
    expect(getEnv(source, "production").RESEND_API_KEY).toBe(
      "re_preview_capture_not_a_credential"
    );
    expect(() =>
      getEnv({ ...source, VERCEL_ENV: "production" }, "production")
    ).toThrow("RESEND_API_KEY");
    expect(() =>
      getEnv({ ...source, EMAIL_DELIVERY_MODE: undefined }, "production")
    ).toThrow("RESEND_API_KEY");
  });
  it("allows identity database access without email configuration", () => {
    expect(
      getDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: validProductionEnv.DATABASE_URL,
      })
    ).toBe(validProductionEnv.DATABASE_URL);
    expect(() => getDatabaseUrl({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL"
    );
  });
  it("accepts a complete production configuration", () => {
    const expected: Record<string, string> = { ...validProductionEnv };
    delete expected.NODE_ENV;
    expect(
      getEnv(validProductionEnv as NodeJS.ProcessEnv, "production")
    ).toEqual(expected);
  });

  it.each([
    "DATABASE_URL",
    "ATTRIBUTION_HASH_SECRET",
    "NEXT_PUBLIC_SITE_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "INTERNAL_OUTBOX_SECRET",
  ])("fails closed when production %s is absent", (name) => {
    const source = { ...validProductionEnv };
    delete source[name as keyof typeof source];
    expect(() => getEnv(source as NodeJS.ProcessEnv, "production")).toThrow(
      name
    );
  });

  it("rejects insecure production site URLs and short secrets", () => {
    expect(() =>
      getEnv(
        {
          ...validProductionEnv,
          NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
          INTERNAL_OUTBOX_SECRET: "short",
        } as NodeJS.ProcessEnv,
        "production"
      )
    ).toThrow("NEXT_PUBLIC_SITE_URL");
  });

  it("provides localhost-only development defaults", () => {
    const env = getEnv({ NODE_ENV: "development" }, "development");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.DATABASE_URL).toBe("postgres://localhost:5432/waitlist");
  });
});
