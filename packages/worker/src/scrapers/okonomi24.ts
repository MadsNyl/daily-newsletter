const BASE_URL = "https://www.okonomi24.com";

interface JsonLdArticle {
  "@type": string;
  headline: string;
  url: string;
  image: string;
}

interface JsonLdListItem {
  "@type": string;
  position: number;
  item: JsonLdArticle;
}

interface JsonLdItemList {
  "@type": string;
  mainEntity?: {
    "@type": string;
    itemListElement: JsonLdListItem[];
  };
}

export interface ScrapedArticle {
  title: string;
  sourceUrl: string;
  sourceName: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

async function fetchPublishedDate(url: string): Promise<Date | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();

    // Try JSON-LD datePublished
    const jsonLdMatches = html.matchAll(
      /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    );
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (entry.datePublished) {
            const date = new Date(entry.datePublished);
            if (!isNaN(date.getTime())) return date;
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: meta tag
    const metaMatch = html.match(
      /<meta\s+property="article:published_time"\s+content="([^"]+)"/,
    );
    if (metaMatch?.[1]) {
      const date = new Date(metaMatch[1]);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  } catch {
    return null;
  }
}

export async function scrapeOkonomi24(): Promise<ScrapedArticle[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch okonomi24.com: ${res.status}`);
  }

  const html = await res.text();
  const jsonLdMatches = html.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  );

  let items: JsonLdListItem[] = [];
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const entries: JsonLdItemList[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const data of entries) {
        if (data.mainEntity?.itemListElement?.length) {
          items = data.mainEntity.itemListElement;
          break;
        }
      }
      if (items.length > 0) break;
    } catch {
      continue;
    }
  }

  const filtered = items
    .filter((entry) => entry.item?.headline && entry.item?.url);

  const articles: ScrapedArticle[] = [];
  for (const entry of filtered) {
    const sourceUrl = entry.item.url.startsWith("http")
      ? entry.item.url
      : `${BASE_URL}${entry.item.url}`;
    const publishedAt = await fetchPublishedDate(sourceUrl);

    if (!publishedAt) {
      continue;
    }

    articles.push({
      title: entry.item.headline,
      sourceUrl,
      sourceName: "Økonomi24",
      thumbnailUrl: entry.item.image || null,
      publishedAt,
    });
  }

  return articles;
}
