import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { article } from "../db/schema.js";
import { desc, gte, lte, and } from "drizzle-orm";

const app = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

app.get("/", async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, 400);
  }

  const { limit, offset, from, to } = parsed.data;

  const conditions = [];
  if (from) {
    conditions.push(gte(article.publishedAt, new Date(from)));
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(article.publishedAt, toDate));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const articles = await db
    .select()
    .from(article)
    .where(where)
    .orderBy(desc(article.publishedAt))
    .limit(limit)
    .offset(offset);

  const total = await db.$count(article, where);

  return c.json({ data: articles, pagination: { limit, offset, total } });
});

export default app;
