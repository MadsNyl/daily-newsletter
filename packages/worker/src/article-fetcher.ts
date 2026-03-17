import Parser from "rss-parser";
import { db } from "./db/index.js";
import { article } from "./db/schema.js";
import { feeds, type FeedSource } from "./feeds.js";

const parser = new Parser();

interface FetchedArticle {
  title: string;
  sourceUrl: string;
  sourceName: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

function extractThumbnail(item: Parser.Item): string | null {
  const media = item as Record<string, unknown>;

  if (typeof media.enclosure === "object" && media.enclosure !== null) {
    const enc = media.enclosure as Record<string, string>;
    if (enc.type?.startsWith("image/") && enc.url) {
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
  }

  return { inserted, skipped };
}
