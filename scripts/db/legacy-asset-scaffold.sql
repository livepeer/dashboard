-- Exact observed pre-migration scaffold, used only for catalog verification.
-- Never execute this CREATE TABLE on an existing application schema.
CREATE TABLE "mcp_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "principal_id" text NOT NULL,
  "url" text NOT NULL,
  "capability" text NOT NULL,
  "gateway_request_id" text NOT NULL,
  "provider_request_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_assets_job_url_unique" UNIQUE ("gateway_request_id", "url")
);
--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_created_idx" ON "mcp_assets" ("principal_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_capability_idx" ON "mcp_assets" ("principal_id", "capability");
