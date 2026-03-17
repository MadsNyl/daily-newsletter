import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { newsletterEdition, editionArticle, article } from "../db/schema.js";
import { desc, eq, asc } from "drizzle-orm";
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

  const targetDate = new Date(parsed.data);
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

  const articles = await db
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
