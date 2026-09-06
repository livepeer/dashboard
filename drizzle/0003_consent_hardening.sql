ALTER TABLE "email_outbox" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD COLUMN "requested_marketing_consent" boolean DEFAULT false NOT NULL;