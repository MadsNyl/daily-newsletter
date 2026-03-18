import OpenAI from "openai";
import { db } from "./db/index.js";
import { article, newsletterEdition, editionArticle } from "./db/schema.js";
import { eq, asc } from "drizzle-orm";
import { config } from "./config.js";

const client = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `Du er en norsk nyhetsredaktør som skriver daglige oppsummeringer av nyhetsbrevet. Skriv en oppsummering i markdown-format som gir leseren et raskt overblikk over dagens viktigste nyheter. Bruk en profesjonell og nøytral tone. Strukturer oppsummeringen med korte avsnitt. Skriv på norsk.`;

function buildArticleList(
  articles: Array<{ title: string; summary: string | null; sourceName: string }>,
): string {
  return articles
    .map(
      (a, i) =>
        `${i + 1}. **${a.title}** (${a.sourceName})${a.summary ? `\n   ${a.summary}` : ""}`,
    )
    .join("\n");
}

export async function summarizeEdition(): Promise<{ date: string; updated: boolean }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = today.toISOString().split("T")[0];

  const editions = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, today))
    .limit(1);

  const edition = editions[0];
  if (!edition) {
    console.log("No edition found for today, skipping edition summarize");
    return { date: dateStr, updated: false };
  }

  const editionArticles = await db
    .select({
      title: article.title,
      summary: article.summary,
      sourceName: article.sourceName,
    })
    .from(editionArticle)
    .innerJoin(article, eq(editionArticle.articleId, article.id))
    .where(eq(editionArticle.editionId, edition.id))
    .orderBy(asc(editionArticle.order));

  if (editionArticles.length === 0) {
    console.log("No articles in edition, skipping edition summarize");
    return { date: dateStr, updated: false };
  }

  const articleList = buildArticleList(editionArticles);

  let userMessage: string;
  if (edition.summary) {
    userMessage = `Her er den eksisterende oppsummeringen av dagens nyhetsbrev:\n\n${edition.summary}\n\nHer er den oppdaterte listen med alle dagens artikler:\n\n${articleList}\n\nOppdater oppsummeringen slik at den dekker alle artiklene. Behold relevant innhold fra den eksisterende oppsummeringen, men legg til nye artikler og fjern artikler som ikke lenger er med. Svar kun med den oppdaterte oppsummeringen i markdown-format.`;
  } else {
    userMessage = `Her er dagens artikler i nyhetsbrevet:\n\n${articleList}\n\nSkriv en oppsummering av dagens nyhetsbrev i markdown-format. Svar kun med oppsummeringen.`;
  }

  const response = await client.chat.completions.create({
    model: "openai/gpt-4.1-mini",
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const summary = response.choices[0]?.message?.content;
  if (!summary) {
    throw new Error("Empty response from OpenRouter");
  }

  await db
    .update(newsletterEdition)
    .set({ summary })
    .where(eq(newsletterEdition.id, edition.id));

  console.log(
    `Edition summary ${edition.summary ? "updated" : "created"} for ${dateStr} (${editionArticles.length} articles)`,
  );

  return { date: dateStr, updated: true };
}
