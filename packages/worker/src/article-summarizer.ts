import OpenAI from "openai";
import { db } from "./db/index.js";
import { article } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { config } from "./config.js";

const client = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `Du er en norsk nyhetsredaktør. Skriv et kort og informativt sammendrag av følgende nyhetsartikkel på norsk. Sammendraget skal være på 2-3 setninger, og skal dekke de viktigste poengene i artikkelen. Bruk en nøytral og profesjonell tone. Svar kun med ren tekst uten markdown-formatering, overskrifter eller punktlister.`;

async function summarizeArticle(title: string, sourceName: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "Qwen/Qwen2.5-7B-Instruct",
    max_tokens: 300,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Artikkel:\nTittel: ${title}\nKilde: ${sourceName}` },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from OpenRouter");
  }

  return text;
}

export async function summarizePendingArticles(): Promise<{ summarized: number; failed: number }> {
  const pending = await db
    .select()
    .from(article)
    .where(eq(article.status, "PENDING"));

  let summarized = 0;
  let failed = 0;

  for (const a of pending) {
    try {
      const summary = await summarizeArticle(a.title, a.sourceName);

      await db
        .update(article)
        .set({ summary, status: "SUMMARIZED" })
        .where(eq(article.id, a.id));

      summarized++;
      console.log(`Summarized: "${a.title}"`);
    } catch (err) {
      console.error(`Failed to summarize "${a.title}":`, err);

      await db
        .update(article)
        .set({ status: "FAILED" })
        .where(eq(article.id, a.id));

      failed++;
    }

    if (pending.indexOf(a) < pending.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, config.summarizeRateLimitMs));
    }
  }

  return { summarized, failed };
}
