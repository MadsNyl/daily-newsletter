import { pgTable, uuid, text, timestamp, pgEnum, integer, unique } from "drizzle-orm/pg-core";

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
