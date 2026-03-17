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

  return items
    .filter((entry) => entry.item?.headline && entry.item?.url)
    .slice(0, 10)
    .map((entry) => ({
      title: entry.item.headline,
      sourceUrl: entry.item.url.startsWith("http")
        ? entry.item.url
        : `${BASE_URL}${entry.item.url}`,
      sourceName: "Økonomi24",
      thumbnailUrl: entry.item.image || null,
      publishedAt: null,
    }));
}
