CREATE TYPE "public"."access_grant_status" AS ENUM('approved', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."email_subscription_status" AS ENUM('subscribed', 'unsubscribed');--> statement-breakpoint
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
DROP INDEX "auth_identities_provider_subject_idx";--> statement-breakpoint
ALTER TABLE "auth_identities" ALTER COLUMN "external_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD COLUMN "authority" text DEFAULT 'auth0' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD COLUMN "issuer" text;--> statement-breakpoint
ALTER TABLE "consent_events" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "enrollment_source" text DEFAULT 'waitlist' NOT NULL;--> statement-breakpoint
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
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_subscription_id_email_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."email_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_authority_issuer_subject_idx" ON "auth_identities" USING btree ("authority","issuer","provider_subject") WHERE "auth_identities"."issuer" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_legacy_provider_subject_idx" ON "auth_identities" USING btree ("provider","provider_subject") WHERE "auth_identities"."issuer" is null;--> statement-breakpoint
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
