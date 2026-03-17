import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db/index.js";
import { article } from "./db/schema.js";
import { eq } from "drizzle-orm";

const client = new Anthropic();

const RATE_LIMIT_DELAY_MS = Number(process.env.SUMMARIZE_RATE_LIMIT_MS ?? "1000");

const SUMMARY_PROMPT = `Du er en norsk nyhetsredaktør. Skriv et kort og informativt sammendrag av følgende nyhetsartikkel på norsk. Sammendraget skal være på 2-3 setninger, og skal dekke de viktigste poengene i artikkelen. Bruk en nøytral og profesjonell tone.

Artikkel:
Tittel: {title}
Kilde: {source}`;

async function summarizeArticle(title: string, sourceName: string): Promise<string> {
  const prompt = SUMMARY_PROMPT.replace("{title}", title).replace("{source}", sourceName);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  return block.text;
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
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  return { summarized, failed };
}
