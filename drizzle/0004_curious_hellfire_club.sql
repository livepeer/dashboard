CREATE TYPE "public"."account_role" AS ENUM('member', 'admin');--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "account_role" "account_role" DEFAULT 'member' NOT NULL;