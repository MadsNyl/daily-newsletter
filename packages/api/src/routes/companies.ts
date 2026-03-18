import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  newsletterEdition,
  editionArticle,
  articleCompany,
  company,
  article,
} from "../db/schema.js";
import { eq, asc, and, desc, sql } from "drizzle-orm";

const app = new Hono();

const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

app.get("/", async (c) => {
  const dateParam = c.req.query("date");

  // No date param: return all active companies
  if (!dateParam) {
    const companies = await db
      .select({
        ticker: company.ticker,
        name: company.name,
      })
      .from(company)
      .where(eq(company.isActive, true))
      .orderBy(asc(company.ticker));

    return c.json({ data: companies });
  }

  // With date param: existing behavior (companies for that edition)
  const parsed = dateQuerySchema.safeParse(dateParam);
  if (!parsed.success) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  const [year, month, day] = parsed.data.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0, 0, 0, 0);
  if (isNaN(targetDate.getTime())) {
    return c.json({ error: "Invalid date." }, 400);
  }

  const editions = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, targetDate))
    .limit(1);

  if (editions.length === 0) {
    return c.json({ data: [] });
  }

  const edition = editions[0];

  const companies = await db
    .selectDistinct({
      ticker: company.ticker,
      name: company.name,
    })
    .from(editionArticle)
    .innerJoin(articleCompany, eq(editionArticle.articleId, articleCompany.articleId))
    .innerJoin(company, eq(articleCompany.companyId, company.id))
    .where(eq(editionArticle.editionId, edition.id))
    .orderBy(asc(company.name));

  return c.json({ data: companies });
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

app.get("/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  const [found] = await db
    .select({ id: company.id, ticker: company.ticker, name: company.name })
    .from(company)
    .where(eq(company.ticker, ticker))
    .limit(1);

  if (!found) {
    return c.json({ error: "Company not found." }, 404);
  }

  const parsed = paginationSchema.safeParse(c.req.query());
  const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

  const articles = await db
    .select({
      id: article.id,
      title: article.title,
      summary: article.summary,
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      thumbnailUrl: article.thumbnailUrl,
      publishedAt: article.publishedAt,
    })
    .from(articleCompany)
    .innerJoin(article, eq(articleCompany.articleId, article.id))
    .where(and(eq(articleCompany.companyId, found.id), eq(article.status, "SUMMARIZED")))
    .orderBy(desc(article.publishedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articleCompany)
    .innerJoin(article, eq(articleCompany.articleId, article.id))
    .where(and(eq(articleCompany.companyId, found.id), eq(article.status, "SUMMARIZED")));

  const total = countResult?.count ?? 0;

  return c.json({
    data: {
      ticker: found.ticker,
      name: found.name,
      articles,
    },
    pagination: { limit, offset, total },
  });
});

app.get("/:ticker/quote", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  const [found] = await db
    .select({ ticker: company.ticker })
    .from(company)
    .where(eq(company.ticker, ticker))
    .limit(1);

  if (!found) {
    return c.json({ error: "Company not found." }, 404);
  }

  try {
    // Try E24 market suffixes: OSE (main), MERK (Euronext Growth), OAX (Oslo Axess)
    const suffixes = ["OSE", "MERK", "OAX"];
    let res: Response | null = null;

    for (const suffix of suffixes) {
      res = await fetch(`https://api.e24.no/bors/v2/instruments/${ticker}.${suffix}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) break;
    }

    if (!res || !res.ok) {
      return c.json({ error: "Failed to fetch quote data." }, 502);
    }

    const json = await res.json();
    const t = json.ticker ?? {};
    const extra = json.tickerExtra ?? {};
    const owners = (json.topOwners ?? []).slice(0, 5);

    return c.json({
      data: {
        price: t.value ?? null,
        currency: t.currency ?? "NOK",
        changeIntraDay: t.changeIntraDay ?? null,
        changePctIntraDay: t.changePctIntraDay ?? null,
        high: t.high ?? null,
        low: t.low ?? null,
        volume: t.volume ?? null,
        marketCap: t.marketCap ?? null,
        peValue: t.peValue ?? null,
        analysts: {
          buy: extra.buyRecommendations ?? 0,
          overweight: extra.overweightRecommendations ?? 0,
          hold: extra.holdRecommendations ?? 0,
          underweight: extra.underweightRecommendations ?? 0,
          sell: extra.sellRecommendations ?? 0,
        },
        topOwners: owners.map((o: { investor: string; percentageOfTotal: number }) => ({
          investor: o.investor,
          percentageOfTotal: o.percentageOfTotal,
        })),
      },
    });
  } catch {
    return c.json({ error: "Failed to fetch quote data." }, 502);
  }
});

const RANGE_INTERVAL_MAP: Record<string, string> = {
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "6mo": "1d",
  "1y": "1d",
  "5y": "1wk",
};

const rangeSchema = z.enum(["1d", "5d", "1mo", "6mo", "1y", "5y"]).default("1d");

app.get("/:ticker/chart", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  const [found] = await db
    .select({ ticker: company.ticker })
    .from(company)
    .where(eq(company.ticker, ticker))
    .limit(1);

  if (!found) {
    return c.json({ error: "Company not found." }, 404);
  }

  const rangeParsed = rangeSchema.safeParse(c.req.query("range"));
  const range = rangeParsed.success ? rangeParsed.data : "1d";
  const interval = RANGE_INTERVAL_MAP[range];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.OL?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return c.json({ error: "Failed to fetch chart data." }, 502);
    }

    const json = await res.json();
    const result = json.chart?.result?.[0];

    if (!result) {
      return c.json({ error: "No chart data available." }, 502);
    }

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const volumes: number[] = result.indicators?.quote?.[0]?.volume ?? [];

    return c.json({
      data: {
        timestamps,
        close: closes,
        volume: volumes,
      },
    });
  } catch {
    return c.json({ error: "Failed to fetch chart data." }, 502);
  }
});

export default app;
