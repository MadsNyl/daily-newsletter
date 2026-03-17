import { db } from "./db/index.js";
import { article, newsletterEdition, editionArticle } from "./db/schema.js";
import { eq, and, gte, lt } from "drizzle-orm";

export async function buildEdition(): Promise<{ date: string; articleCount: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

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

  const existing = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, today))
    .limit(1);

  let editionId: string;

  if (existing.length > 0) {
    editionId = existing[0].id;

    await db.delete(editionArticle).where(eq(editionArticle.editionId, editionId));
  } else {
    const [newEdition] = await db
      .insert(newsletterEdition)
      .values({ date: today, status: "DRAFT" })
      .returning({ id: newsletterEdition.id });
    editionId = newEdition.id;
  }

  const editionArticles = summarizedArticles.map((a, index) => ({
    editionId,
    articleId: a.id,
    order: index + 1,
  }));

  await db.insert(editionArticle).values(editionArticles);

  console.log(
    `Edition for ${today.toISOString().split("T")[0]} built with ${summarizedArticles.length} articles`,
  );

  return { date: today.toISOString().split("T")[0], articleCount: summarizedArticles.length };
}
