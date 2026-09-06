CREATE TABLE "mcp_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"url" text NOT NULL,
	"capability" text NOT NULL,
	"gateway_request_id" text NOT NULL,
	"provider_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_assets_principal_job_url_unique" ON "mcp_assets" USING btree ("principal_id","gateway_request_id","url");--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_created_idx" ON "mcp_assets" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_capability_idx" ON "mcp_assets" USING btree ("principal_id","capability");