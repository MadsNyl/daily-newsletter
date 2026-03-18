import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  newsletterEdition,
  editionArticle,
  articleCompany,
  company,
  article,
} from "../db/schema.js";
import { eq, asc, and, desc, sql } from "drizzle-orm";

const app = new Hono();

const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

app.get("/", async (c) => {
  const dateParam = c.req.query("date");

  // No date param: return all active companies
  if (!dateParam) {
    const companies = await db
      .select({
        ticker: company.ticker,
        name: company.name,
      })
      .from(company)
      .where(eq(company.isActive, true))
      .orderBy(asc(company.ticker));

    return c.json({ data: companies });
  }

  // With date param: existing behavior (companies for that edition)
  const parsed = dateQuerySchema.safeParse(dateParam);
  if (!parsed.success) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  const [year, month, day] = parsed.data.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0, 0, 0, 0);
  if (isNaN(targetDate.getTime())) {
    return c.json({ error: "Invalid date." }, 400);
  }

  const editions = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, targetDate))
    .limit(1);

  if (editions.length === 0) {
    return c.json({ data: [] });
  }

  const edition = editions[0];

  const companies = await db
    .selectDistinct({
      ticker: company.ticker,
      name: company.name,
    })
    .from(editionArticle)
    .innerJoin(articleCompany, eq(editionArticle.articleId, articleCompany.articleId))
    .innerJoin(company, eq(articleCompany.companyId, company.id))
    .where(eq(editionArticle.editionId, edition.id))
    .orderBy(asc(company.name));

  return c.json({ data: companies });
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

app.get("/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  const [found] = await db
    .select({ id: company.id, ticker: company.ticker, name: company.name })
    .from(company)
    .where(eq(company.ticker, ticker))
    .limit(1);

  if (!found) {
    return c.json({ error: "Company not found." }, 404);
  }

  const parsed = paginationSchema.safeParse(c.req.query());
  const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

  const articles = await db
    .select({
      id: article.id,
      title: article.title,
      summary: article.summary,
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      thumbnailUrl: article.thumbnailUrl,
      publishedAt: article.publishedAt,
    })
    .from(articleCompany)
    .innerJoin(article, eq(articleCompany.articleId, article.id))
    .where(and(eq(articleCompany.companyId, found.id), eq(article.status, "SUMMARIZED")))
    .orderBy(desc(article.publishedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articleCompany)
    .innerJoin(article, eq(articleCompany.articleId, article.id))
    .where(and(eq(articleCompany.companyId, found.id), eq(article.status, "SUMMARIZED")));

  const total = countResult?.count ?? 0;

  return c.json({
    data: {
      ticker: found.ticker,
      name: found.name,
      articles,
    },
    pagination: { limit, offset, total },
  });
});

export default app;
