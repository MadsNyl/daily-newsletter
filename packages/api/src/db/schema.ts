import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  integer,
  unique,
  boolean,
} from "drizzle-orm/pg-core";

export const articleStatusEnum = pgEnum("article_status", ["PENDING", "SUMMARIZED", "FAILED"]);

export const editionStatusEnum = pgEnum("edition_status", ["DRAFT", "PUBLISHED"]);

export const article = pgTable("article", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  summary: text("summary"),
  thumbnailUrl: text("thumbnail_url"),
  sourceUrl: text("source_url").notNull().unique(),
  sourceName: text("source_name").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  status: articleStatusEnum("status").default("PENDING").notNull(),
});

export const newsletterEdition = pgTable("newsletter_edition", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "date" }).notNull().unique(),
  summary: text("summary"),
  status: editionStatusEnum("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editionArticle = pgTable(
  "edition_article",
  {
    editionId: uuid("edition_id")
      .notNull()
      .references(() => newsletterEdition.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
  },
  (table) => [unique().on(table.editionId, table.articleId)],
);

export const company = pgTable("company", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticker: text("ticker").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const articleCompany = pgTable(
  "article_company",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.articleId, table.companyId)],
);
