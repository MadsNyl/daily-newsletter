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

async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();

    // Try JSON-LD articleBody first
    const jsonLdMatches = html.matchAll(
      /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    );
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (entry.articleBody && typeof entry.articleBody === "string") {
            return entry.articleBody.slice(0, 3000);
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: extract <p> tags from <article> or body
    const articleMatch = html.match(/<article[\s>]([\s\S]*?)<\/article>/i);
    const scope = articleMatch ? articleMatch[1] : html;
    const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
      .filter((p) => p.length > 40);

    if (paragraphs.length > 0) {
      return paragraphs.join("\n\n").slice(0, 3000);
    }

    return null;
  } catch {
    return null;
  }
}

async function summarizeArticle(
  title: string,
  sourceName: string,
  content: string | null,
): Promise<string> {
  let userContent = `Artikkel:\nTittel: ${title}\nKilde: ${sourceName}`;
  if (content) {
    userContent += `\n\nInnhold:\n${content}`;
  }

  const response = await client.chat.completions.create({
    model: "openai/gpt-4.1-mini",
    max_tokens: 300,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
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
      const content = await fetchArticleContent(a.sourceUrl);
      const summary = await summarizeArticle(a.title, a.sourceName, content);

      await db
        .update(article)
        .set({ summary, status: "SUMMARIZED" })
        .where(eq(article.id, a.id));

      summarized++;
      console.log(`Summarized: "${a.title}"${content ? "" : " (title only)"}`);
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
