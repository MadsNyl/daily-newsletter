CREATE TYPE "public"."article_status" AS ENUM('PENDING', 'SUMMARIZED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."edition_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"thumbnail_url" text,
	"source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "article_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "article_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE TABLE "edition_article" (
	"edition_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "edition_article_edition_id_article_id_unique" UNIQUE("edition_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_edition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"status" "edition_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_edition_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "edition_article" ADD CONSTRAINT "edition_article_edition_id_newsletter_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."newsletter_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_article" ADD CONSTRAINT "edition_article_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;