import { db } from "./db/index.js";
import { company } from "./db/schema.js";
import { eq, and, lt, sql } from "drizzle-orm";

const TICKER_URL = "https://stockanalysis.com/list/oslo-bors/";
const MIN_TICKER_COUNT = 100;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface ScrapedTicker {
  symbol: string;
  name: string;
}

export function extractTickers(html: string): ScrapedTicker[] {
  const regex = /{no:\d+,s:"osl\/([^"]+)",n:"([^"]+)"/g;
  const tickers: ScrapedTicker[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    tickers.push({
      symbol: match[1].toUpperCase(),
      name: match[2],
    });
  }

  return tickers;
}

export async function syncTickers(): Promise<{
  total: number;
  upserted: number;
  deactivated: number;
}> {
  const res = await fetch(TICKER_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ticker page: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const tickers = extractTickers(html);

  if (tickers.length < MIN_TICKER_COUNT) {
    throw new Error(
      `Scraper breakage detected: only ${tickers.length} tickers found (minimum: ${MIN_TICKER_COUNT})`,
    );
  }

  const syncTimestamp = new Date();

  const result = await db.transaction(async (tx) => {
    const upserted = await tx
      .insert(company)
      .values(
        tickers.map((t) => ({
          ticker: t.symbol,
          name: t.name,
          exchange: "OSL",
          isActive: true,
          lastSeenAt: syncTimestamp,
        })),
      )
      .onConflictDoUpdate({
        target: company.ticker,
        set: {
          name: sql`excluded.name`,
          exchange: "OSL",
          isActive: true,
          lastSeenAt: syncTimestamp,
        },
      });

    const deactivated = await tx
      .update(company)
      .set({ isActive: false })
      .where(and(eq(company.exchange, "OSL"), lt(company.lastSeenAt, syncTimestamp)));

    return {
      upserted: upserted.rowCount ?? 0,
      deactivated: deactivated.rowCount ?? 0,
    };
  });

  return {
    total: tickers.length,
    upserted: result.upserted,
    deactivated: result.deactivated,
  };
}
