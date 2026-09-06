import { z } from "zod";

const productionEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "must be a PostgreSQL URL"
    ),
  ATTRIBUTION_HASH_SECRET: z.string().min(32),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        new URL(value).protocol === "https:" &&
        !new URL(value).username &&
        !new URL(value).password,
      "must be a credential-free HTTPS URL"
    ),
  RESEND_API_KEY: z.string().startsWith("re_").min(8),
  EMAIL_FROM: z
    .string()
    .regex(
      /^(?:[^<>]+<)?[^@\s<>]+@[^@\s<>]+>?$/,
      "must contain a sender email"
    ),
  INTERNAL_OUTBOX_SECRET: z.string().min(32),
});

const developmentEnvSchema = productionEnvSchema.partial().extend({
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000"),
});

export type AppEnv = z.infer<typeof productionEnvSchema>;

export function getDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env
): string {
  const value =
    source.DATABASE_URL ??
    (source.NODE_ENV === "production"
      ? undefined
      : "postgres://localhost:5432/waitlist");
  const parsed = productionEnvSchema.shape.DATABASE_URL.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid server environment configuration: DATABASE_URL");
  }
  return parsed.data;
}

let cachedEnv: AppEnv | undefined;

export function getEnv(
  source: NodeJS.ProcessEnv = process.env,
  nodeEnv = source.NODE_ENV
): AppEnv {
  if (source === process.env && cachedEnv) return cachedEnv;

  // Preview capture cannot contact a real email provider. Supply inert values
  // only in that explicit non-production mode; production remains strict.
  const validationSource =
    source.VERCEL_ENV === "preview" && source.EMAIL_DELIVERY_MODE === "capture"
      ? {
          ...source,
          RESEND_API_KEY: "re_preview_capture_not_a_credential",
          EMAIL_FROM:
            source.EMAIL_FROM || "Console Preview <preview@example.invalid>",
        }
      : source;

  const parsed =
    nodeEnv === "production"
      ? productionEnvSchema.safeParse(validationSource)
      : developmentEnvSchema.safeParse(validationSource);

  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Invalid server environment configuration: ${fields}`);
  }

  const env = {
    DATABASE_URL:
      parsed.data.DATABASE_URL ?? "postgres://localhost:5432/waitlist",
    ATTRIBUTION_HASH_SECRET:
      parsed.data.ATTRIBUTION_HASH_SECRET ??
      "local-development-attribution-secret",
    NEXT_PUBLIC_SITE_URL: parsed.data.NEXT_PUBLIC_SITE_URL,
    RESEND_API_KEY:
      parsed.data.RESEND_API_KEY ?? "local-development-resend-key",
    EMAIL_FROM: parsed.data.EMAIL_FROM ?? "Waitlist <waitlist@localhost>",
    INTERNAL_OUTBOX_SECRET:
      parsed.data.INTERNAL_OUTBOX_SECRET ??
      "local-development-internal-outbox-secret",
  };

  if (source === process.env) cachedEnv = env;
  return env;
}

export function resetEnvCacheForTests() {
  cachedEnv = undefined;
}
