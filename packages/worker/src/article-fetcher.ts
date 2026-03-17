import Parser from "rss-parser";
import { db } from "./db/index.js";
import { article, articleCompany, company } from "./db/schema.js";
import { feeds, type FeedSource } from "./feeds.js";
import { scrapeOkonomi24 } from "./scrapers/okonomi24.js";
import { resolveCompany } from "./company-lookup.js";
import { eq } from "drizzle-orm";

const parser = new Parser({
  customFields: {
    item: ["image", ["companies", "companies"]],
  },
});

interface FetchedArticle {
  title: string;
  sourceUrl: string;
  sourceName: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  tickers: string[];
}

export function parseTickers(item: Record<string, unknown>): string[] {
  const companies = item.companies as Record<string, unknown> | undefined;
  if (!companies?.company) return [];
  const raw = companies.company;
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") return [raw];
  return [];
}

function extractThumbnail(item: Parser.Item): string | null {
  const media = item as Record<string, unknown>;

  // Check custom <image> tag (used by E24)
  if (typeof media.image === "string" && media.image) {
    return media.image;
  }

  // Check enclosure (accept any image-like type including "img/jpg")
  if (typeof media.enclosure === "object" && media.enclosure !== null) {
    const enc = media.enclosure as Record<string, string>;
    if (enc.url && (enc.type?.startsWith("image/") || enc.type?.startsWith("img/"))) {
      return enc.url;
    }
  }

  const content = (item.content ?? (item as Record<string, unknown>)["content:encoded"] ?? "") as string;
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
  if (imgMatch?.[1]) {
    return imgMatch[1];
  }

  return null;
}

async function isPaywalled(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('"isAccessibleForFree":false') || html.includes('"isAccessibleForFree": false');
  } catch {
    return false;
  }
}

async function fetchFeed(source: FeedSource): Promise<FetchedArticle[]> {
  const feed = await parser.parseURL(source.url);
  const articles: FetchedArticle[] = [];

  for (const item of feed.items) {
    if (!item.title || !item.link) continue;

    articles.push({
      title: item.title,
      sourceUrl: item.link,
      sourceName: source.name,
      thumbnailUrl: extractThumbnail(item),
      publishedAt: item.pubDate ? new Date(item.pubDate) : null,
      tickers: parseTickers(item as unknown as Record<string, unknown>),
    });
  }

  return articles;
}

export async function fetchArticles(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const source of feeds) {
    let articles: FetchedArticle[];
    try {
      articles = await fetchFeed(source);
      console.log(`Fetched ${articles.length} articles from ${source.name}`);
    } catch (err) {
      console.error(`Failed to fetch feed from ${source.name}:`, err);
      continue;
    }

    for (const a of articles) {
      if (await isPaywalled(a.sourceUrl)) {
        console.log(`Skipping paywalled article: "${a.title}"`);
        skipped++;
        continue;
      }

      try {
        const result = await db
          .insert(article)
          .values({
            title: a.title,
            sourceUrl: a.sourceUrl,
            sourceName: a.sourceName,
            thumbnailUrl: a.thumbnailUrl,
            publishedAt: a.publishedAt,
            status: "PENDING",
          })
          .onConflictDoNothing({ target: article.sourceUrl });

        if (result.rowCount && result.rowCount > 0) {
          inserted++;

          // Link article to companies (E24 only — other sources have empty tickers)
          if (a.sourceName === "E24" && a.tickers.length > 0) {
            const [insertedArticle] = await db
              .select({ id: article.id })
              .from(article)
              .where(eq(article.sourceUrl, a.sourceUrl));

            if (insertedArticle) {
              for (const ticker of a.tickers) {
                try {
                  const comp = await resolveCompany(ticker);
                  await db
                    .insert(articleCompany)
                    .values({ articleId: insertedArticle.id, companyId: comp.id })
                    .onConflictDoNothing();
                } catch (err) {
                  console.error(`Failed to link company ${ticker} to article:`, err);
                }
              }
            }
          }
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Failed to insert article "${a.title}":`, err);
        skipped++;
      }
    }
  }

  // Scrape sites without RSS feeds
  try {
    const scraped = await scrapeOkonomi24();
    console.log(`Scraped ${scraped.length} articles from Økonomi24`);

    for (const a of scraped) {
      try {
        const result = await db
          .insert(article)
          .values({
            title: a.title,
            sourceUrl: a.sourceUrl,
            sourceName: a.sourceName,
            thumbnailUrl: a.thumbnailUrl,
            publishedAt: a.publishedAt,
            status: "PENDING",
          })
          .onConflictDoNothing({ target: article.sourceUrl });

        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Failed to insert article "${a.title}":`, err);
        skipped++;
      }
    }
  } catch (err) {
    console.error("Failed to scrape Økonomi24:", err);
  }

  return { inserted, skipped };
}
