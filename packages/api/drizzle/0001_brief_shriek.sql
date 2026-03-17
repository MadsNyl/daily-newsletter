CREATE TABLE "article_company" (
	"article_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	CONSTRAINT "article_company_article_id_company_id_unique" UNIQUE("article_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
ALTER TABLE "article_company" ADD CONSTRAINT "article_company_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_company" ADD CONSTRAINT "article_company_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;