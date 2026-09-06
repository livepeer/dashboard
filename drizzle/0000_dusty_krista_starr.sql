CREATE TYPE "public"."signup_status" AS ENUM('pending', 'confirmed', 'invited', 'unsubscribed', 'suppressed');--> statement-breakpoint
CREATE TABLE "attribution_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"role" text NOT NULL,
	"use_case" text NOT NULL,
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
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attribution_touches_signup_idx" ON "attribution_touches" USING btree ("signup_id");--> statement-breakpoint
CREATE INDEX "consent_events_signup_idx" ON "consent_events" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_idempotency_idx" ON "email_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_outbox_unprocessed_idx" ON "email_outbox" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_normalized_email_idx" ON "waitlist_signups" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "waitlist_signups_status_idx" ON "waitlist_signups" USING btree ("status");