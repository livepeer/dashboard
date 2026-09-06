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
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_signups" ALTER COLUMN "role" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "waitlist_signups" ALTER COLUMN "use_case" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "referral_code" text;--> statement-breakpoint
UPDATE "waitlist_signups" SET "referral_code" = replace(gen_random_uuid()::text, '-', '') WHERE "referral_code" IS NULL;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ALTER COLUMN "referral_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "referred_by" uuid;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_referral_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("referral_signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_events_reason_referral_idx" ON "point_events" USING btree ("reason","referral_signup_id");--> statement-breakpoint
CREATE INDEX "point_events_signup_idx" ON "point_events" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_bucket_idx" ON "rate_limits" USING btree ("key_hash","bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_signup_idx" ON "sessions" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_idx" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_signup_idx" ON "verification_tokens" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_referral_code_idx" ON "waitlist_signups" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "waitlist_signups_referred_by_idx" ON "waitlist_signups" USING btree ("referred_by");--> statement-breakpoint
CREATE INDEX "waitlist_signups_confirmed_idx" ON "waitlist_signups" USING btree ("confirmed_at","id");
