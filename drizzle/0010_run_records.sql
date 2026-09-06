CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"event_key" text NOT NULL,
	"status" "run_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_read_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"admin_grant_id" uuid NOT NULL,
	"action" text NOT NULL,
	"run_id" text,
	"result_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_read_audits_action_check" CHECK ("run_read_audits"."action" in ('list', 'detail'))
);
--> statement-breakpoint
CREATE TABLE "run_reconciliation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"queue" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_reconciliation_attempts_check" CHECK ("run_reconciliation_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"external_account_id" uuid NOT NULL,
	"gateway_request_id" text NOT NULL,
	"provider_request_id" text,
	"provider" text,
	"source" text NOT NULL,
	"capability" text NOT NULL,
	"model_id" text,
	"endpoint" text,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"submitted_arguments" jsonb,
	"result" jsonb,
	"capture_redacted_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"capture_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "runs_source_check" CHECK ("runs"."source" in ('mcp', 'console', 'api', 'gateway')),
	CONSTRAINT "runs_version_check" CHECK ("runs"."version" > 0 and "runs"."capture_version" > 0),
	CONSTRAINT "runs_arguments_object_check" CHECK ("runs"."submitted_arguments" is null or jsonb_typeof("runs"."submitted_arguments") = 'object'),
	CONSTRAINT "runs_result_object_check" CHECK ("runs"."result" is null or jsonb_typeof("runs"."result") = 'object'),
	CONSTRAINT "runs_completion_check" CHECK (("runs"."status" in ('succeeded', 'failed', 'cancelled')) = ("runs"."completed_at" is not null)),
	CONSTRAINT "runs_timestamps_check" CHECK ("runs"."updated_at" >= "runs"."created_at" and ("runs"."started_at" is null or "runs"."started_at" >= "runs"."created_at") and ("runs"."completed_at" is null or "runs"."completed_at" >= coalesce("runs"."started_at", "runs"."created_at")))
);
--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "available_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "unavailable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_read_audits" ADD CONSTRAINT "run_read_audits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_read_audits" ADD CONSTRAINT "run_read_audits_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_reconciliation_jobs" ADD CONSTRAINT "run_reconciliation_jobs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_external_account_id_external_accounts_id_fk" FOREIGN KEY ("external_account_id") REFERENCES "public"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_key_unique" ON "run_events" USING btree ("run_id","event_key");--> statement-breakpoint
CREATE INDEX "run_events_run_created_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_read_audits_actor_created_idx" ON "run_read_audits" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_reconciliation_run_unique" ON "run_reconciliation_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_reconciliation_available_idx" ON "run_reconciliation_jobs" USING btree ("available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_principal_gateway_unique" ON "runs" USING btree ("principal_id","gateway_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_asset_owner_unique" ON "runs" USING btree ("id","principal_id","gateway_request_id");--> statement-breakpoint
CREATE INDEX "runs_principal_created_idx" ON "runs" USING btree ("principal_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "runs_status_updated_idx" ON "runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "runs_user_created_idx" ON "runs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD CONSTRAINT "mcp_assets_run_owner_fk" FOREIGN KEY ("run_id","principal_id","gateway_request_id") REFERENCES "public"."runs"("id","principal_id","gateway_request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_assets_run_idx" ON "mcp_assets" USING btree ("run_id");
--> statement-breakpoint
CREATE FUNCTION "run_history_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'run history audit is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "run_events_immutable" BEFORE UPDATE OR DELETE ON "run_events"
FOR EACH ROW EXECUTE FUNCTION "run_history_immutable"();
--> statement-breakpoint
CREATE TRIGGER "run_read_audits_immutable" BEFORE UPDATE OR DELETE ON "run_read_audits"
FOR EACH ROW EXECUTE FUNCTION "run_history_immutable"();
--> statement-breakpoint
CREATE TRIGGER "run_events_immutable_truncate" BEFORE TRUNCATE ON "run_events"
FOR EACH STATEMENT EXECUTE FUNCTION "run_history_immutable"();
--> statement-breakpoint
CREATE TRIGGER "run_read_audits_immutable_truncate" BEFORE TRUNCATE ON "run_read_audits"
FOR EACH STATEMENT EXECUTE FUNCTION "run_history_immutable"();
--> statement-breakpoint
CREATE FUNCTION "run_owner_binding_check"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."external_accounts" account
    WHERE account.id = NEW.external_account_id AND account.user_id = NEW.user_id
      AND account.external_user_id = NEW.principal_id AND account.service = 'pymthouse') THEN
    RAISE EXCEPTION 'run owner binding mismatch' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id, NEW.external_account_id, NEW.principal_id, NEW.gateway_request_id)
    IS DISTINCT FROM (OLD.user_id, OLD.external_account_id, OLD.principal_id, OLD.gateway_request_id) THEN
    RAISE EXCEPTION 'run ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "runs_owner_binding" BEFORE INSERT OR UPDATE ON "runs"
FOR EACH ROW EXECUTE FUNCTION "run_owner_binding_check"();
