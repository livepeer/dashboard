CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."account_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."signup_status" AS ENUM('pending', 'confirmed', 'invited', 'unsubscribed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."access_grant_status" AS ENUM('approved', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."email_subscription_status" AS ENUM('subscribed', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authority" text DEFAULT 'auth0' NOT NULL,
	"issuer" text,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"source" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attribution_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"signup_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"disclosure_version" text NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"last_error_code" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"referral_signup_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key_hash" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"requested_marketing_consent" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"user_id" uuid,
	"account_role" "account_role" DEFAULT 'member' NOT NULL,
	"enrollment_source" text DEFAULT 'waitlist' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"use_case" text DEFAULT '' NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by" uuid,
	"status" "signup_status" DEFAULT 'pending' NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"first_touch" jsonb NOT NULL,
	"last_touch" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "external_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"service" text NOT NULL,
	"issuer" text NOT NULL,
	"app_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_external_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"external_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"actor_admin_grant_id" uuid,
	"operation_id" uuid,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"previous_status" "access_grant_status",
	"next_status" "access_grant_status" NOT NULL,
	"grant_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_events_action_check" CHECK ("access_events"."action" in ('approve', 'revoke', 'activate', 'grandfather')),
	CONSTRAINT "access_events_version_check" CHECK ("access_events"."grant_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"signup_id" uuid,
	"status" "access_grant_status" NOT NULL,
	"source" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_target_check" CHECK ("access_grants"."user_id" is not null or "access_grants"."signup_id" is not null),
	CONSTRAINT "access_grants_version_check" CHECK ("access_grants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "access_operation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"signup_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"code" text,
	"event_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_operation_items_outcome_check" CHECK ("access_operation_items"."outcome" in ('approved', 'revoked', 'unchanged', 'ineligible', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "access_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_admin_grant_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"action" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_operations_action_check" CHECK ("access_operations"."action" in ('approve', 'revoke'))
);
--> statement-breakpoint
CREATE TABLE "admin_role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"source" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_role_grants_role_check" CHECK ("admin_role_grants"."role" = 'admin')
);
--> statement-breakpoint
CREATE TABLE "oauth_code_redemptions" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_email" text NOT NULL,
	"purpose" text NOT NULL,
	"status" "email_subscription_status" DEFAULT 'unsubscribed' NOT NULL,
	"user_id" uuid,
	"signup_id" uuid,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"url" text NOT NULL,
	"capability" text NOT NULL,
	"gateway_request_id" text NOT NULL,
	"provider_request_id" text,
	"run_id" text,
	"media_type" text,
	"available_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"unavailable_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_subscription_id_email_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."email_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_referral_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("referral_signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_referred_by_waitlist_signups_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."waitlist_signups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_accounts" ADD CONSTRAINT "external_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_external_accounts" ADD CONSTRAINT "identity_external_accounts_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_external_accounts" ADD CONSTRAINT "identity_external_accounts_external_account_id_external_accounts_id_fk" FOREIGN KEY ("external_account_id") REFERENCES "public"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_actor_admin_grant_id_admin_role_grants_id_fk" FOREIGN KEY ("actor_admin_grant_id") REFERENCES "public"."admin_role_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_operation_id_access_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."access_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_operation_items" ADD CONSTRAINT "access_operation_items_operation_id_access_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."access_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_operation_items" ADD CONSTRAINT "access_operation_items_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_operation_items" ADD CONSTRAINT "access_operation_items_event_id_access_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."access_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_operations" ADD CONSTRAINT "access_operations_actor_admin_grant_id_admin_role_grants_id_fk" FOREIGN KEY ("actor_admin_grant_id") REFERENCES "public"."admin_role_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_grants" ADD CONSTRAINT "admin_role_grants_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_read_audits" ADD CONSTRAINT "run_read_audits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_read_audits" ADD CONSTRAINT "run_read_audits_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_reconciliation_jobs" ADD CONSTRAINT "run_reconciliation_jobs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_external_account_id_external_accounts_id_fk" FOREIGN KEY ("external_account_id") REFERENCES "public"."external_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_authority_issuer_subject_idx" ON "auth_identities" USING btree ("authority","issuer","provider_subject") WHERE "auth_identities"."issuer" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_legacy_provider_subject_idx" ON "auth_identities" USING btree ("provider","provider_subject") WHERE "auth_identities"."issuer" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_external_user_id_idx" ON "auth_identities" USING btree ("external_user_id");--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_user_normalized_idx" ON "user_emails" USING btree ("user_id","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_verified_normalized_idx" ON "user_emails" USING btree ("normalized_email") WHERE "user_emails"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_primary_user_idx" ON "user_emails" USING btree ("user_id") WHERE "user_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "attribution_touches_signup_idx" ON "attribution_touches" USING btree ("signup_id");--> statement-breakpoint
CREATE INDEX "consent_events_signup_idx" ON "consent_events" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_idempotency_idx" ON "email_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_outbox_unprocessed_idx" ON "email_outbox" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "point_events_reason_referral_idx" ON "point_events" USING btree ("reason","referral_signup_id");--> statement-breakpoint
CREATE INDEX "point_events_signup_idx" ON "point_events" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_bucket_idx" ON "rate_limits" USING btree ("key_hash","bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_signup_idx" ON "sessions" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_idx" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_signup_idx" ON "verification_tokens" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_normalized_email_idx" ON "waitlist_signups" USING btree ("normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_referral_code_idx" ON "waitlist_signups" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "waitlist_signups_status_idx" ON "waitlist_signups" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_user_idx" ON "waitlist_signups" USING btree ("user_id") WHERE "waitlist_signups"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "waitlist_signups_referred_by_idx" ON "waitlist_signups" USING btree ("referred_by");--> statement-breakpoint
CREATE INDEX "waitlist_signups_confirmed_idx" ON "waitlist_signups" USING btree ("confirmed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_accounts_scope_external_idx" ON "external_accounts" USING btree ("service","issuer","app_id","external_user_id");--> statement-breakpoint
CREATE INDEX "external_accounts_user_scope_idx" ON "external_accounts" USING btree ("user_id","service","issuer","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_external_accounts_binding_idx" ON "identity_external_accounts" USING btree ("identity_id","external_account_id");--> statement-breakpoint
CREATE INDEX "identity_external_accounts_account_idx" ON "identity_external_accounts" USING btree ("external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_events_operation_grant_idx" ON "access_events" USING btree ("operation_id","grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_events_grant_version_idx" ON "access_events" USING btree ("grant_id","grant_version");--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_user_idx" ON "access_grants" USING btree ("user_id") WHERE "access_grants"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_signup_idx" ON "access_grants" USING btree ("signup_id") WHERE "access_grants"."signup_id" is not null;--> statement-breakpoint
CREATE INDEX "access_grants_status_idx" ON "access_grants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "access_operation_items_operation_signup_idx" ON "access_operation_items" USING btree ("operation_id","signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_operations_actor_request_idx" ON "access_operations" USING btree ("actor_admin_grant_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_role_grants_signup_role_idx" ON "admin_role_grants" USING btree ("signup_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscriptions_address_purpose_idx" ON "email_subscriptions" USING btree ("normalized_email","purpose");--> statement-breakpoint
CREATE INDEX "email_subscriptions_user_idx" ON "email_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_subscriptions_signup_idx" ON "email_subscriptions" USING btree ("signup_id");--> statement-breakpoint
CREATE INDEX "mcp_assets_run_idx" ON "mcp_assets" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_assets_principal_job_url_unique" ON "mcp_assets" USING btree ("principal_id","gateway_request_id","url");--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_created_idx" ON "mcp_assets" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mcp_assets_principal_capability_idx" ON "mcp_assets" USING btree ("principal_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_key_unique" ON "run_events" USING btree ("run_id","event_key");--> statement-breakpoint
CREATE INDEX "run_events_run_created_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_read_audits_actor_created_idx" ON "run_read_audits" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_reconciliation_run_unique" ON "run_reconciliation_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_reconciliation_available_idx" ON "run_reconciliation_jobs" USING btree ("available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_principal_gateway_unique" ON "runs" USING btree ("principal_id","gateway_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_asset_owner_unique" ON "runs" USING btree ("id","principal_id","gateway_request_id");--> statement-breakpoint
ALTER TABLE "mcp_assets" ADD CONSTRAINT "mcp_assets_run_owner_fk" FOREIGN KEY ("run_id","principal_id","gateway_request_id") REFERENCES "public"."runs"("id","principal_id","gateway_request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_principal_created_idx" ON "runs" USING btree ("principal_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "runs_status_updated_idx" ON "runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "runs_user_created_idx" ON "runs" USING btree ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
-- Preserve legacy administrator authority without granting product access.
INSERT INTO admin_role_grants (signup_id, role, source)
SELECT id, 'admin', 'legacy_waitlist_admin' FROM waitlist_signups
WHERE account_role = 'admin'
ON CONFLICT (signup_id, role) DO NOTHING;--> statement-breakpoint
-- Only affirmative, unambiguous evidence can backfill a subscribed state.
-- No historical evidence or contradictory latest events are never consent.
WITH purposes AS (
  SELECT id AS signup_id, 'product_marketing'::text AS purpose FROM waitlist_signups
  UNION SELECT signup_id, purpose FROM consent_events
), latest_time AS (
  SELECT signup_id, purpose, max(occurred_at) AS occurred_at
  FROM consent_events GROUP BY signup_id, purpose
), latest AS (
  SELECT e.signup_id, e.purpose, bool_and(e.granted) AS granted,
    bool_and(e.granted) <> bool_or(e.granted) AS ambiguous
  FROM consent_events e JOIN latest_time t
    ON e.signup_id = t.signup_id AND e.purpose = t.purpose AND e.occurred_at = t.occurred_at
  GROUP BY e.signup_id, e.purpose
)
INSERT INTO email_subscriptions (normalized_email, purpose, status, user_id, signup_id, source)
SELECT w.normalized_email, p.purpose,
  CASE WHEN w.status = 'confirmed' AND l.granted = true AND NOT l.ambiguous
    AND (p.purpose <> 'product_marketing' OR w.marketing_consent = true)
    THEN 'subscribed'::email_subscription_status ELSE 'unsubscribed'::email_subscription_status END,
  w.user_id, w.id,
  CASE WHEN coalesce(l.ambiguous, false)
    OR (p.purpose = 'product_marketing' AND w.marketing_consent IS DISTINCT FROM coalesce(l.granted, false))
    THEN 'legacy_consent_conflict' ELSE 'legacy_consent_backfill' END
FROM purposes p JOIN waitlist_signups w ON w.id = p.signup_id
LEFT JOIN latest l ON l.signup_id = p.signup_id AND l.purpose = p.purpose
ON CONFLICT (normalized_email, purpose) DO NOTHING;--> statement-breakpoint
UPDATE consent_events e SET subscription_id = s.id
FROM email_subscriptions s
WHERE s.signup_id = e.signup_id AND s.purpose = e.purpose
  AND e.subscription_id IS NULL;--> statement-breakpoint
-- Product grants are deliberately absent. They require a reviewed manifest.
CREATE FUNCTION reject_access_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'access_events is append-only' USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER access_events_immutable_rows BEFORE UPDATE OR DELETE ON access_events
FOR EACH ROW EXECUTE FUNCTION reject_access_audit_mutation();--> statement-breakpoint
CREATE TRIGGER access_events_immutable_truncate BEFORE TRUNCATE ON access_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_access_audit_mutation();--> statement-breakpoint
CREATE FUNCTION preserve_legacy_identity_alias() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.external_user_id IS NOT NULL AND NEW.external_user_id IS DISTINCT FROM OLD.external_user_id THEN
    RAISE EXCEPTION 'legacy external identity alias is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER auth_identities_preserve_legacy_alias BEFORE UPDATE ON auth_identities
FOR EACH ROW EXECUTE FUNCTION preserve_legacy_identity_alias();--> statement-breakpoint
CREATE FUNCTION preserve_external_account_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.user_id, NEW.service, NEW.issuer, NEW.app_id, NEW.external_user_id)
    IS DISTINCT FROM (OLD.user_id, OLD.service, OLD.issuer, OLD.app_id, OLD.external_user_id) THEN
    RAISE EXCEPTION 'external account mapping is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER external_accounts_preserve_mapping BEFORE UPDATE ON external_accounts
FOR EACH ROW EXECUTE FUNCTION preserve_external_account_mapping();

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
