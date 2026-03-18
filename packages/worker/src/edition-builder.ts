import { db } from "./db/index.js";
import { article, newsletterEdition, editionArticle } from "./db/schema.js";
import { eq, and, gte, lt } from "drizzle-orm";

async function buildEditionForDate(
  date: Date,
  articles: { id: string }[],
): Promise<number> {
  const existing = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, date))
    .limit(1);

  let editionId: string;

  if (existing.length > 0) {
    editionId = existing[0].id;
    await db.delete(editionArticle).where(eq(editionArticle.editionId, editionId));
  } else {
    const [newEdition] = await db
      .insert(newsletterEdition)
      .values({ date, status: "DRAFT" })
      .returning({ id: newsletterEdition.id });
    editionId = newEdition.id;
  }

  const editionArticles = articles.map((a, index) => ({
    editionId,
    articleId: a.id,
    order: index + 1,
  }));

  await db.insert(editionArticle).values(editionArticles);

  const dateStr = date.toISOString().split("T")[0];
  console.log(`Edition for ${dateStr} built with ${articles.length} articles`);

  return articles.length;
}

export async function buildEdition(): Promise<{ date: string; articleCount: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get all summarized articles created today
  const summarizedArticles = await db
    .select()
    .from(article)
    .where(
      and(eq(article.status, "SUMMARIZED"), gte(article.createdAt, today), lt(article.createdAt, tomorrow)),
    );

  if (summarizedArticles.length === 0) {
    console.log("No summarized articles found for today, skipping edition build");
    return { date: today.toISOString().split("T")[0], articleCount: 0 };
  }

  // Group articles by publishedAt date (fall back to today if no publishedAt)
  const byDate = new Map<string, { id: string }[]>();

  for (const a of summarizedArticles) {
    const articleDate = new Date(a.publishedAt ?? a.createdAt);
    articleDate.setHours(0, 0, 0, 0);
    const dateKey = articleDate.toISOString().split("T")[0];

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push({ id: a.id });
  }

  let totalCount = 0;
  for (const [dateKey, articles] of byDate) {
    const editionDate = new Date(dateKey);
    editionDate.setHours(0, 0, 0, 0);
    totalCount += await buildEditionForDate(editionDate, articles);
  }

  return { date: today.toISOString().split("T")[0], articleCount: totalCount };
}
