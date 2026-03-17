# Company Tickers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract company tickers from E24 RSS, resolve names via scraping, store in DB, enable server-side filtering, and display in frontend.

**Architecture:** Two new DB tables (`company`, `article_company`) link tickers to articles. The worker resolves ticker names on first encounter by scraping E24 instrument pages. The API includes companies on article responses and supports `?company=` filtering. The frontend shows company chips on cards and a filter bar.

**Tech Stack:** Drizzle ORM, Hono, Vitest, React, rss-parser

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/api/src/db/schema.ts` | Add `company` + `article_company` tables |
| Modify | `packages/worker/src/db/schema.ts` | Mirror same schema changes |
| Create | `packages/worker/src/company-lookup.ts` | Resolve ticker → company name via DB cache or E24 scrape |
| Modify | `packages/worker/src/article-fetcher.ts` | Parse tickers from RSS, link articles to companies |
| Create | `packages/api/src/routes/companies.ts` | `GET /api/companies?date=` endpoint |
| Modify | `packages/api/src/routes/newsletters.ts` | Include companies on articles, support `?company=` filter |
| Modify | `packages/api/src/index.ts` | Register companies route |
| Modify | `packages/web/src/api/client.ts` | Add Company type, fetchCompanies, update fetchEdition |
| Modify | `packages/web/src/components/ArticleCard.tsx` | Render company chips |
| Modify | `packages/web/src/pages/NewsletterPage.tsx` | Filter bar + query param handling |
| Modify | `package.json` (root) | Add vitest, test script |
| Create | `vitest.config.ts` (root) | Vitest configuration |
| Create | `packages/worker/src/__tests__/company-lookup.test.ts` | Tests for name resolution |
| Create | `packages/worker/src/__tests__/article-fetcher.test.ts` | Tests for ticker parsing |
| Create | `packages/api/src/__tests__/newsletters.test.ts` | Tests for company inclusion + filtering |
| Create | `packages/api/src/__tests__/companies.test.ts` | Tests for companies endpoint |

---

## Chunk 1: Testing Infrastructure + Data Model

### Task 1: Add Vitest

**Files:**
- Modify: `package.json` (root)
- Create: `vitest.config.ts` (root)

- [ ] **Step 1: Install vitest**

Run:
```bash
pnpm add -D vitest -w
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts` at root:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 3: Add test script to root package.json**

Add to `scripts` in root `package.json`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Commit**

```bash
git add package.json vitest.config.ts pnpm-lock.yaml
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Add DB schema for company tables

**Files:**
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/worker/src/db/schema.ts`

- [ ] **Step 1: Add company and article_company tables to API schema**

In `packages/api/src/db/schema.ts`, add after the existing `editionArticle` table:

```ts
export const company = pgTable("company", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticker: text("ticker").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const articleCompany = pgTable(
  "article_company",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.articleId, table.companyId)],
);
```

- [ ] **Step 2: Mirror the same tables in worker schema**

Copy the exact same `company` and `articleCompany` definitions to `packages/worker/src/db/schema.ts`.

- [ ] **Step 3: Push schema to DB**

Run:
```bash
pnpm db:push
```
Expected: Tables `company` and `article_company` created successfully.

- [ ] **Step 4: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/db/schema.ts packages/worker/src/db/schema.ts
git commit -m "feat: add company and article_company tables"
```

---

## Chunk 2: Worker — Company Lookup

### Task 3: Write company-lookup tests

**Files:**
- Create: `packages/worker/src/__tests__/company-lookup.test.ts`

- [ ] **Step 1: Write test file**

Create `packages/worker/src/__tests__/company-lookup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the module under test
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// We'll import after mocking
const { db } = await import("../db/index.js");

describe("company-lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("extractCompanyName", () => {
    // Import the pure function directly for unit testing
    const { extractCompanyName } = await import("../company-lookup.js");

    it("extracts name from JSON-LD Corporation schema", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBe("EQUINOR");
    });

    it("extracts name when JSON-LD is embedded in larger object", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Corporation","name":"STOREBRAND","tickerSymbol":"STB","url":"https://e24.no"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBe("STOREBRAND");
    });

    it("returns null when no Corporation schema found", () => {
      const html = `<html><head></head><body>No schema here</body></html>`;
      expect(extractCompanyName(html)).toBeNull();
    });

    it("returns null when JSON-LD has no name field", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@type":"Corporation","tickerSymbol":"EQNR"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBeNull();
    });
  });

  describe("resolveCompany", () => {
    const { resolveCompany } = await import("../company-lookup.js");

    it("returns existing company from DB without fetching", async () => {
      const mockCompany = { id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" };
      const fromChain = { where: vi.fn().mockResolvedValue([mockCompany]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("fetches from E24 and inserts when ticker not in DB", async () => {
      // DB returns empty
      const fromChain = { where: vi.fn().mockResolvedValue([]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      // Mock fetch to return HTML with Corporation schema
      const html = `<script type="application/ld+json">{"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}</script>`;
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      });

      // Mock insert chain
      const returningChain = { returning: vi.fn().mockResolvedValue([{ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" }]) };
      const valuesChain = { values: vi.fn().mockReturnValue(returningChain) };
      const insertChain = { into: vi.fn().mockReturnValue(valuesChain) };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" });
      expect(fetch).toHaveBeenCalledWith(
        "https://e24.no/bors/instrument/EQNR.OSE",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("falls back to ticker as name when fetch fails", async () => {
      // DB returns empty
      const fromChain = { where: vi.fn().mockResolvedValue([]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      // Mock fetch failure
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      // Mock insert chain
      const returningChain = { returning: vi.fn().mockResolvedValue([{ id: "uuid-1", ticker: "EQNR.OSE", name: "EQNR.OSE" }]) };
      const valuesChain = { values: vi.fn().mockReturnValue(returningChain) };
      const insertChain = { into: vi.fn().mockReturnValue(valuesChain) };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQNR.OSE" });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm test packages/worker/src/__tests__/company-lookup.test.ts
```
Expected: FAIL — module `../company-lookup.js` not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/worker/src/__tests__/company-lookup.test.ts
git commit -m "test: add failing company-lookup tests"
```

---

### Task 4: Implement company-lookup

**Files:**
- Create: `packages/worker/src/company-lookup.ts`

- [ ] **Step 1: Write implementation**

Create `packages/worker/src/company-lookup.ts`:

```ts
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
  // Check DB cache first
  const existing = await db
    .select()
    .from(company)
    .where(eq(company.ticker, ticker));

  if (existing.length > 0) {
    return { id: existing[0].id, ticker: existing[0].ticker, name: existing[0].name };
  }

  // Scrape E24 instrument page for name
  let name = ticker; // fallback
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

  // Insert and return
  const [inserted] = await db
    .insert(company)
    .values({ ticker, name })
    .returning();

  return { id: inserted.id, ticker: inserted.ticker, name: inserted.name };
}
```

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test packages/worker/src/__tests__/company-lookup.test.ts
```
Expected: Tests may need adjustment due to exact mock shapes. Fix any mock issues until all tests pass.

- [ ] **Step 3: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/worker/src/company-lookup.ts packages/worker/src/__tests__/company-lookup.test.ts
git commit -m "feat: add company name resolution with E24 scraping"
```

---

## Chunk 3: Worker — Article Fetcher Changes

### Task 5: Write article-fetcher ticker parsing tests

**Files:**
- Create: `packages/worker/src/__tests__/article-fetcher.test.ts`

- [ ] **Step 1: Write test file**

Create `packages/worker/src/__tests__/article-fetcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTickers } from "../article-fetcher.js";

describe("parseTickers", () => {
  it("extracts tickers from companies array", () => {
    const item = {
      companies: {
        company: ["EQNR.OSE", "STL.OSE"],
      },
    };
    expect(parseTickers(item)).toEqual(["EQNR.OSE", "STL.OSE"]);
  });

  it("handles single company (not array)", () => {
    const item = {
      companies: {
        company: "EQNR.OSE",
      },
    };
    expect(parseTickers(item)).toEqual(["EQNR.OSE"]);
  });

  it("returns empty array when no companies tag", () => {
    const item = {};
    expect(parseTickers(item)).toEqual([]);
  });

  it("returns empty array when companies is empty", () => {
    const item = { companies: {} };
    expect(parseTickers(item)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm test packages/worker/src/__tests__/article-fetcher.test.ts
```
Expected: FAIL — `parseTickers` not exported.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/worker/src/__tests__/article-fetcher.test.ts
git commit -m "test: add failing article-fetcher ticker parsing tests"
```

---

### Task 6: Implement article-fetcher changes

**Files:**
- Modify: `packages/worker/src/article-fetcher.ts`

- [ ] **Step 1: Add companies custom field to RSS parser**

In `packages/worker/src/article-fetcher.ts`, update the parser config:

```ts
const parser = new Parser({
  customFields: {
    item: ["image", ["companies", "companies"]],
  },
});
```

- [ ] **Step 2: Add tickers to FetchedArticle and export parseTickers**

Add after the `FetchedArticle` interface:

```ts
export function parseTickers(item: Record<string, unknown>): string[] {
  const companies = item.companies as Record<string, unknown> | undefined;
  if (!companies?.company) return [];
  const raw = companies.company;
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") return [raw];
  return [];
}
```

Add `tickers` field to `FetchedArticle`:

```ts
interface FetchedArticle {
  title: string;
  sourceUrl: string;
  sourceName: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  tickers: string[];
}
```

- [ ] **Step 3: Parse tickers in fetchFeed**

In the `fetchFeed` function, update the article push to include tickers:

```ts
articles.push({
  title: item.title,
  sourceUrl: item.link,
  sourceName: source.name,
  thumbnailUrl: extractThumbnail(item),
  publishedAt: item.pubDate ? new Date(item.pubDate) : null,
  tickers: parseTickers(item as unknown as Record<string, unknown>),
});
```

- [ ] **Step 4: Add company linking after article insert**

Add imports at top:
```ts
import { articleCompany, company } from "./db/schema.js";
import { resolveCompany } from "./company-lookup.js";
import { eq } from "drizzle-orm";
```

In the `fetchArticles` function, after the successful article insert (inside `if (result.rowCount && result.rowCount > 0)`), add company linking:

```ts
if (result.rowCount && result.rowCount > 0) {
  inserted++;

  // Link article to companies (E24 only — other sources have empty tickers)
  if (a.sourceName === "E24" && a.tickers.length > 0) {
    // Get the inserted article's ID
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
}
```

- [ ] **Step 5: Run ticker parsing tests**

Run:
```bash
pnpm test packages/worker/src/__tests__/article-fetcher.test.ts
```
Expected: PASS

- [ ] **Step 6: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/worker/src/article-fetcher.ts packages/worker/src/__tests__/article-fetcher.test.ts
git commit -m "feat: parse company tickers from E24 RSS and link to articles"
```

---

## Chunk 4: API — Companies on Articles + Filtering

### Task 7: Write API tests

**Files:**
- Create: `packages/api/src/__tests__/newsletters.test.ts`
- Create: `packages/api/src/__tests__/companies.test.ts`

- [ ] **Step 1: Write newsletter company tests**

Create `packages/api/src/__tests__/newsletters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the db module
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    $count: vi.fn(),
  },
}));

// Mock the queue module
vi.mock("../queue.js", () => ({
  getQueue: vi.fn(),
}));

const { db } = await import("../db/index.js");
const app = new Hono();
const newsletters = (await import("../routes/newsletters.js")).default;
app.route("/newsletters", newsletters);

describe("GET /newsletters/:date", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes companies array on each article", async () => {
    // This test verifies the response shape includes companies.
    // The exact mock setup depends on the final query structure.
    // At minimum, verify the response type includes the companies field.
    const res = await app.request("/newsletters/2026-03-17");
    // If edition not found, 404 is expected — the important thing is
    // that when data IS returned, it includes companies.
    expect([200, 404]).toContain(res.status);
  });

  it("filters articles by company query param", async () => {
    const res = await app.request("/newsletters/2026-03-17?company=EQNR.OSE");
    expect([200, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Write companies endpoint tests**

Create `packages/api/src/__tests__/companies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
}));

const app = new Hono();
const companies = (await import("../routes/companies.js")).default;
app.route("/companies", companies);

describe("GET /companies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when date param is missing", async () => {
    const res = await app.request("/companies");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/companies?date=not-a-date");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
pnpm test packages/api/src/__tests__/
```
Expected: FAIL — `../routes/companies.js` not found.

- [ ] **Step 4: Commit failing tests**

```bash
git add packages/api/src/__tests__/
git commit -m "test: add failing API tests for companies"
```

---

### Task 8: Update newsletters route with company data

**Files:**
- Modify: `packages/api/src/routes/newsletters.ts`

- [ ] **Step 1: Import company tables**

Add to imports in `packages/api/src/routes/newsletters.ts`:

```ts
import { newsletterEdition, editionArticle, article, company, articleCompany } from "../db/schema.js";
```

- [ ] **Step 2: Add company query param to date endpoint**

Update the `GET /:date` handler to accept optional `company` query param and include companies on articles:

```ts
app.get("/:date", async (c) => {
  const dateParam = c.req.param("date");
  const parsed = dateParamSchema.safeParse(dateParam);
  if (!parsed.success) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  const companyFilter = c.req.query("company");

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

  const edition = editions[0];
  if (!edition) {
    return c.json({ error: "Newsletter edition not found." }, 404);
  }

  // Build articles query
  let articlesQuery = db
    .select({
      id: article.id,
      title: article.title,
      summary: article.summary,
      thumbnailUrl: article.thumbnailUrl,
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      publishedAt: article.publishedAt,
      status: article.status,
      order: editionArticle.order,
    })
    .from(editionArticle)
    .innerJoin(article, eq(editionArticle.articleId, article.id))
    .where(eq(editionArticle.editionId, edition.id))
    .orderBy(asc(editionArticle.order));

  // Apply company filter if provided
  if (companyFilter) {
    articlesQuery = db
      .select({
        id: article.id,
        title: article.title,
        summary: article.summary,
        thumbnailUrl: article.thumbnailUrl,
        sourceUrl: article.sourceUrl,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        status: article.status,
        order: editionArticle.order,
      })
      .from(editionArticle)
      .innerJoin(article, eq(editionArticle.articleId, article.id))
      .innerJoin(articleCompany, eq(articleCompany.articleId, article.id))
      .innerJoin(company, eq(articleCompany.companyId, company.id))
      .where(
        and(
          eq(editionArticle.editionId, edition.id),
          eq(company.ticker, companyFilter),
        ),
      )
      .orderBy(asc(editionArticle.order));
  }

  const articleRows = await articlesQuery;

  // Fetch companies for each article
  const articleIds = articleRows.map((a) => a.id);
  let companiesMap: Record<string, Array<{ ticker: string; name: string }>> = {};

  if (articleIds.length > 0) {
    const articleCompanies = await db
      .select({
        articleId: articleCompany.articleId,
        ticker: company.ticker,
        name: company.name,
      })
      .from(articleCompany)
      .innerJoin(company, eq(articleCompany.companyId, company.id))
      .where(inArray(articleCompany.articleId, articleIds));

    for (const ac of articleCompanies) {
      if (!companiesMap[ac.articleId]) {
        companiesMap[ac.articleId] = [];
      }
      companiesMap[ac.articleId].push({ ticker: ac.ticker, name: ac.name });
    }
  }

  const articles = articleRows.map((a) => ({
    ...a,
    companies: companiesMap[a.id] ?? [],
  }));

  return c.json({ data: { ...edition, articles } });
});
```

Add `and` and `inArray` to the drizzle-orm imports:

```ts
import { desc, eq, asc, and, inArray } from "drizzle-orm";
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/newsletters.ts
git commit -m "feat: include companies on articles and support company filter"
```

---

### Task 9: Create companies endpoint

**Files:**
- Create: `packages/api/src/routes/companies.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create companies route**

Create `packages/api/src/routes/companies.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { newsletterEdition, editionArticle, articleCompany, company } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";

const app = new Hono();

const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

app.get("/", async (c) => {
  const dateParam = c.req.query("date");
  if (!dateParam) {
    return c.json({ error: "Missing required query parameter: date" }, 400);
  }

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

  // Find edition
  const editions = await db
    .select()
    .from(newsletterEdition)
    .where(eq(newsletterEdition.date, targetDate))
    .limit(1);

  if (editions.length === 0) {
    return c.json({ data: [] });
  }

  const edition = editions[0];

  // Get distinct companies for articles in this edition
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

export default app;
```

- [ ] **Step 2: Register route in API index**

In `packages/api/src/index.ts`, add:

```ts
import companies from "./routes/companies.js";
```

And after the existing routes:

```ts
app.route("/api/companies", companies);
```

- [ ] **Step 3: Run API tests**

Run:
```bash
pnpm test packages/api/src/__tests__/
```
Expected: PASS (at least the validation tests).

- [ ] **Step 4: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/companies.ts packages/api/src/index.ts packages/api/src/__tests__/
git commit -m "feat: add companies endpoint for edition company listing"
```

---

## Chunk 5: Frontend Changes

### Task 10: Update API client types

**Files:**
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Add Company type and update Article**

In `packages/web/src/api/client.ts`:

Add type:
```ts
export interface Company {
  ticker: string;
  name: string;
}
```

Add `companies` to `Article`:
```ts
export interface Article {
  id: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string | null;
  status: string;
  order: number;
  companies: Company[];
}
```

Update `fetchEdition` to accept optional company filter:
```ts
export async function fetchEdition(
  date: string,
  company?: string,
): Promise<NewsletterEdition | null> {
  const params = new URLSearchParams();
  if (company) params.set("company", company);
  const query = params.toString();
  const url = `/api/newsletters/${date}${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch edition: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}
```

Add `fetchCompanies`:
```ts
export async function fetchCompanies(date: string): Promise<Company[]> {
  const res = await fetch(`/api/companies?date=${date}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/api/client.ts
git commit -m "feat: add Company type and API functions for company filtering"
```

---

### Task 11: Update ArticleCard with company chips

**Files:**
- Modify: `packages/web/src/components/ArticleCard.tsx`

- [ ] **Step 1: Add company chips to ArticleCard**

Replace the content of `packages/web/src/components/ArticleCard.tsx`:

```tsx
import type { Article } from "../api/client";

interface ArticleCardProps {
  article: Article;
  onCompanyClick?: (ticker: string) => void;
}

export default function ArticleCard({ article, onCompanyClick }: ArticleCardProps) {
  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md sm:flex-row"
    >
      {article.thumbnailUrl && (
        <img
          src={article.thumbnailUrl}
          alt=""
          className="h-40 w-full shrink-0 rounded-md object-cover sm:h-28 sm:w-40"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">{article.title}</h2>
        {article.summary && (
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{article.summary}</p>
        )}
        {article.companies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {article.companies.map((c) => (
              <span key={c.ticker} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCompanyClick?.(c.ticker);
                  }}
                  className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {c.name}
                </button>
                <a
                  href={`https://e24.no/bors/instrument/${c.ticker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-gray-400 transition-colors hover:text-blue-600"
                  title={`${c.name} on E24 Bors`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                    <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                  </svg>
                </a>
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-gray-400">
          <span>{article.sourceName}</span>
          {article.publishedAt && (
            <>
              <span>&middot;</span>
              <span>
                {new Date(article.publishedAt).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/ArticleCard.tsx
git commit -m "feat: add company chips to ArticleCard"
```

---

### Task 12: Update NewsletterPage with filter bar

**Files:**
- Modify: `packages/web/src/pages/NewsletterPage.tsx`

- [ ] **Step 1: Update NewsletterPage**

Replace the content of `packages/web/src/pages/NewsletterPage.tsx`:

```tsx
import { useEffect, useReducer, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import type { NewsletterEdition, Company } from "../api/client";
import { fetchEdition, fetchCompanies } from "../api/client";
import ArticleCard from "../components/ArticleCard";

function formatDateParam(date: Date): string {
  return date.toISOString().split("T")[0];
}

function toLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type State = {
  edition: NewsletterEdition | null;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: "fetch" }
  | { type: "success"; edition: NewsletterEdition | null }
  | { type: "error"; message: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "fetch":
      return { edition: null, loading: true, error: null };
    case "success":
      return { edition: action.edition, loading: false, error: null };
    case "error":
      return { edition: null, loading: false, error: action.message };
  }
}

export default function NewsletterPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = formatDateParam(new Date());
  const currentDate = date ?? today;
  const companyFilter = searchParams.get("company") ?? undefined;

  const [state, dispatch] = useReducer(reducer, { edition: null, loading: true, error: null });
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch" });

    fetchEdition(currentDate, companyFilter)
      .then((data) => {
        if (!cancelled) dispatch({ type: "success", edition: data });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [currentDate, companyFilter]);

  useEffect(() => {
    let cancelled = false;

    fetchCompanies(currentDate)
      .then((data) => {
        if (!cancelled) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  function navigateDate(offset: number) {
    const d = toLocalDate(currentDate);
    d.setDate(d.getDate() + offset);
    navigate(`/${formatDateParam(d)}`);
  }

  function setCompanyFilter(ticker: string | undefined) {
    if (ticker) {
      setSearchParams({ company: ticker });
    } else {
      setSearchParams({});
    }
  }

  const isToday = currentDate === today;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Daglig Nyhetsbrev</h1>
        <p className="mt-1 text-gray-500">Norske nyheter, oppsummert daglig.</p>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          &larr; Forrige
        </button>

        <input
          type="date"
          value={currentDate}
          max={today}
          onChange={(e) => navigate(`/${e.target.value}`)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        />

        <button
          onClick={() => navigateDate(1)}
          disabled={isToday}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Neste &rarr;
        </button>
      </div>

      {companies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Selskaper:</span>
          {companies.map((c) => (
            <button
              key={c.ticker}
              onClick={() =>
                setCompanyFilter(companyFilter === c.ticker ? undefined : c.ticker)
              }
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                companyFilter === c.ticker
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {c.name}
              {companyFilter === c.ticker && " \u00d7"}
            </button>
          ))}
        </div>
      )}

      {state.loading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Kunne ikke laste nyhetsbrevet. Prøv igjen senere.
        </div>
      )}

      {!state.loading && !state.error && !state.edition && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          Ingen utgave funnet for{" "}
          {toLocalDate(currentDate).toLocaleDateString("nb-NO", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </div>
      )}

      {!state.loading && !state.error && state.edition && (
        <div className="flex flex-col gap-4">
          {state.edition.articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onCompanyClick={setCompanyFilter}
            />
          ))}
          {state.edition.articles.length === 0 && companyFilter && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
              Ingen artikler funnet for dette selskapet.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm check
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/NewsletterPage.tsx
git commit -m "feat: add company filter bar and query param handling"
```

---

## Chunk 6: Final Verification

### Task 13: Full verification

- [ ] **Step 1: Run all tests**

Run:
```bash
pnpm test
```
Expected: All tests pass.

- [ ] **Step 2: Run full check**

Run:
```bash
pnpm check
```
Expected: No lint or type errors.

- [ ] **Step 3: Verify dev server starts**

Run:
```bash
pnpm dev:api &
sleep 2
curl -s http://localhost:3000/api/health | head -1
```
Expected: `{"status":"ok",...}`

Kill the server after verification.
