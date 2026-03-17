import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { newsletterEdition, editionArticle, article, company, articleCompany } from "../db/schema.js";
import { desc, eq, asc, and, inArray } from "drizzle-orm";
import { getQueue } from "../queue.js";

const app = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

app.get("/", async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, 400);
  }

  const { limit, offset } = parsed.data;

  const editions = await db
    .select()
    .from(newsletterEdition)
    .orderBy(desc(newsletterEdition.date))
    .limit(limit)
    .offset(offset);

  const total = await db.$count(newsletterEdition);

  return c.json({ data: editions, pagination: { limit, offset, total } });
});

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

app.get("/:date", async (c) => {
  const dateParam = c.req.param("date");
  const parsed = dateParamSchema.safeParse(dateParam);
  if (!parsed.success) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  const companyFilter = c.req.query("company");

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

  const edition = editions[0];
  if (!edition) {
    return c.json({ error: "Newsletter edition not found." }, 404);
  }

  // Build articles query
  let articleRows;
  if (companyFilter) {
    articleRows = await db
      .select({
        id: article.id,
        title: article.title,
        summary: article.summary,
        thumbnailUrl: article.thumbnailUrl,
        sourceUrl: article.sourceUrl,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        status: article.status,
        order: editionArticle.order,
      })
      .from(editionArticle)
      .innerJoin(article, eq(editionArticle.articleId, article.id))
      .innerJoin(articleCompany, eq(articleCompany.articleId, article.id))
      .innerJoin(company, eq(articleCompany.companyId, company.id))
      .where(
        and(
          eq(editionArticle.editionId, edition.id),
          eq(company.ticker, companyFilter),
        ),
      )
      .orderBy(asc(editionArticle.order));
  } else {
    articleRows = await db
      .select({
        id: article.id,
        title: article.title,
        summary: article.summary,
        thumbnailUrl: article.thumbnailUrl,
        sourceUrl: article.sourceUrl,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        status: article.status,
        order: editionArticle.order,
      })
      .from(editionArticle)
      .innerJoin(article, eq(editionArticle.articleId, article.id))
      .where(eq(editionArticle.editionId, edition.id))
      .orderBy(asc(editionArticle.order));
  }

  // Fetch companies for each article
  const articleIds = articleRows.map((a) => a.id);
  const companiesMap: Record<string, Array<{ ticker: string; name: string }>> = {};

  if (articleIds.length > 0) {
    const articleCompanies = await db
      .select({
        articleId: articleCompany.articleId,
        ticker: company.ticker,
        name: company.name,
      })
      .from(articleCompany)
      .innerJoin(company, eq(articleCompany.companyId, company.id))
      .where(inArray(articleCompany.articleId, articleIds));

    for (const ac of articleCompanies) {
      if (!companiesMap[ac.articleId]) {
        companiesMap[ac.articleId] = [];
      }
      companiesMap[ac.articleId].push({ ticker: ac.ticker, name: ac.name });
    }
  }

  const articles = articleRows.map((a) => ({
    ...a,
    companies: companiesMap[a.id] ?? [],
  }));

  return c.json({ data: { ...edition, articles } });
});

app.post("/trigger", async (c) => {
  const queue = await getQueue();
  const jobId = await queue.send("article-fetch", {}, { retryLimit: 3, retryDelay: 60 });

  if (!jobId) {
    return c.json({ error: "Failed to queue job. A job may already be pending." }, 409);
  }

  return c.json({ message: "Newsletter pipeline triggered", jobId }, 201);
});

export default app;
