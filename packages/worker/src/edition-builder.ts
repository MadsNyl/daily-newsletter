import { db } from "./db/index.js";
import { article, newsletterEdition, editionArticle } from "./db/schema.js";
import { eq } from "drizzle-orm";

async function addToEdition(date: Date, articles: { id: string }[]): Promise<number> {
  const existing = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, date))
    .limit(1);

  let editionId: string;
  let currentMaxOrder = 0;

  if (existing.length > 0) {
    editionId = existing[0].id;
    const existingArticles = await db
      .select()
      .from(editionArticle)
      .where(eq(editionArticle.editionId, editionId));
    currentMaxOrder = existingArticles.reduce((max, ea) => Math.max(max, ea.order), 0);
  } else {
    const [newEdition] = await db
      .insert(newsletterEdition)
      .values({ date, status: "DRAFT" })
      .returning({ id: newsletterEdition.id });
    editionId = newEdition.id;
  }

  const newEditionArticles = articles.map((a, index) => ({
    editionId,
    articleId: a.id,
    order: currentMaxOrder + index + 1,
  }));

  await db.insert(editionArticle).values(newEditionArticles);

  const dateStr = date.toISOString().split("T")[0];
  console.log(`Edition for ${dateStr}: added ${articles.length} articles`);

  return articles.length;
}

export async function buildEdition(): Promise<{ date: string; articleCount: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all summarized articles not yet assigned to any edition
  const summarizedArticles = await db
    .select()
    .from(article)
    .where(
      eq(article.status, "SUMMARIZED"),
    );

  // Filter out articles already assigned to an edition
  const assignedRows = await db.select({ articleId: editionArticle.articleId }).from(editionArticle);
  const assignedIds = new Set(assignedRows.map((r) => r.articleId));

  const unassignedArticles = summarizedArticles.filter((a) => !assignedIds.has(a.id));

  if (unassignedArticles.length === 0) {
    console.log("No unassigned summarized articles found, skipping edition build");
    return { date: today.toISOString().split("T")[0], articleCount: 0 };
  }

  // Group articles by publishedAt date (fall back to createdAt)
  const byDate = new Map<string, { id: string }[]>();

  for (const a of unassignedArticles) {
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
    totalCount += await addToEdition(editionDate, articles);
  }

  return { date: today.toISOString().split("T")[0], articleCount: totalCount };
}
