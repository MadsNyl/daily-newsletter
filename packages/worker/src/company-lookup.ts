import { db } from "./db/index.js";
import { company } from "./db/schema.js";
import { eq } from "drizzle-orm";

export function extractCompanyName(html: string): string | null {
  const scriptRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json["@type"] === "Corporation" && typeof json.name === "string") {
        return json.name;
      }
    } catch {
      // continue to next script tag
    }
  }
  return null;
}

export async function resolveCompany(
  ticker: string,
): Promise<{ id: string; ticker: string; name: string }> {
  const existing = await db
    .select()
    .from(company)
    .where(eq(company.ticker, ticker));

  if (existing.length > 0) {
    return { id: existing[0].id, ticker: existing[0].ticker, name: existing[0].name };
  }

  let name = ticker;
  try {
    const res = await fetch(`https://e24.no/bors/instrument/${ticker}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const extracted = extractCompanyName(html);
      if (extracted) {
        name = extracted;
      }
    }
  } catch {
    console.warn(`Failed to fetch company name for ${ticker}, using ticker as name`);
  }

  const result = await db
    .insert(company)
    .values({ ticker, name })
    .onConflictDoNothing({ target: company.ticker })
    .returning();

  if (result.length > 0) {
    return { id: result[0].id, ticker: result[0].ticker, name: result[0].name };
  }

  // Race condition: another worker inserted first, fetch from DB
  const [existing2] = await db
    .select()
    .from(company)
    .where(eq(company.ticker, ticker));

  return { id: existing2.id, ticker: existing2.ticker, name: existing2.name };
}
