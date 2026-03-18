ALTER TABLE "company" ADD COLUMN "exchange" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "last_seen_at" timestamp with time zone;