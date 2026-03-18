# Company Details Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company browsing with a searchable list, detail page with live price chart/metrics, and navigation drawer to switch between newsletter and companies.

**Architecture:** Backend proxy endpoints for E24 and Yahoo Finance data (avoiding CORS). New React Router pages for company list and detail. Navigation via hamburger drawer menu on all pages. Chart rendered with shadcn/recharts.

**Tech Stack:** Hono, Drizzle ORM, React 19, React Router v7, Tailwind CSS 4, Recharts, shadcn chart component, vaul drawer

**Spec:** `docs/superpowers/specs/2026-03-18-company-details-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/api/src/routes/companies.ts` | All company endpoints: list, detail, quote proxy, chart proxy |
| `packages/api/src/__tests__/companies.test.ts` | Tests for company endpoints |
| `packages/web/src/App.tsx` | Route definitions |
| `packages/web/src/api/client.ts` | API client functions and types |
| `packages/web/src/components/NavigationDrawer.tsx` | Hamburger menu drawer |
| `packages/web/src/components/PriceChart.tsx` | Area chart with range selector |
| `packages/web/src/pages/CompanyListPage.tsx` | Searchable company list |
| `packages/web/src/pages/CompanyDetailPage.tsx` | Company detail with metrics, chart, articles |
| `packages/web/src/pages/NewsletterPage.tsx` | Add NavigationDrawer to header |

---

### Task 1: Extend GET /api/companies to support no-date listing

**Files:**
- Modify: `packages/api/src/routes/companies.ts:11-53`
- Modify: `packages/api/src/__tests__/companies.test.ts`

- [ ] **Step 1: Update the existing test that expects 400 for missing date**

In `packages/api/src/__tests__/companies.test.ts`, change the first test to expect 200 instead of 400:

```typescript
it("returns all active companies when date param is missing", async () => {
  const fakeCompanies = [
    { ticker: "DNB", name: "DNB Bank ASA" },
    { ticker: "EQNR", name: "Equinor ASA" },
  ];
  vi.mocked(db.select).mockImplementation(() => makeSelectChain(fakeCompanies) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await app.request("/companies");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("data");
  expect(Array.isArray(body.data)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `pnpm --filter @daily-newsletter/api test`
Expected: FAIL — the route still returns 400 for missing date.

- [ ] **Step 3: Implement the no-date branch**

In `packages/api/src/routes/companies.ts`, replace the existing `GET /` handler. When `date` is omitted, query all active companies. Add `boolean` and `article` to schema imports, and add `asc` to drizzle imports (already imported):

```typescript
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
```

Keep the rest of the file below this handler unchanged for now (we add more routes in later tasks).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @daily-newsletter/api test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/companies.ts packages/api/src/__tests__/companies.test.ts
git commit -m "feat: support listing all active companies when date param is omitted"
```

---

### Task 2: Add GET /api/companies/:ticker endpoint

**Files:**
- Modify: `packages/api/src/routes/companies.ts`
- Modify: `packages/api/src/__tests__/companies.test.ts`

- [ ] **Step 1: Add tests for the ticker detail endpoint**

Append to `packages/api/src/__tests__/companies.test.ts`:

```typescript
describe("GET /companies/:ticker", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(db.selectDistinct).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("returns 404 for unknown ticker", async () => {
    vi.mocked(db.select).mockImplementation(() => makeSelectChain([]) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await app.request("/companies/UNKNOWN");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns company with articles", async () => {
    const fakeCompany = { id: "c-1", ticker: "DNB", name: "DNB Bank ASA" };
    const fakeArticles = [
      { id: "a-1", title: "DNB Q4", summary: "Good results", sourceUrl: "https://e24.no/1", sourceName: "E24", thumbnailUrl: null, publishedAt: "2026-03-15" },
    ];

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const result = selectCallCount === 0 ? [fakeCompany] : fakeArticles;
      selectCallCount++;
      return makeSelectChain(result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    const res = await app.request("/companies/DNB");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("ticker", "DNB");
    expect(body.data).toHaveProperty("articles");
    expect(body).toHaveProperty("pagination");
  });

  it("respects limit param", async () => {
    const fakeCompany = { id: "c-1", ticker: "DNB", name: "DNB Bank ASA" };

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const result = selectCallCount === 0 ? [fakeCompany] : [];
      selectCallCount++;
      return makeSelectChain(result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    const res = await app.request("/companies/DNB?limit=5");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @daily-newsletter/api test`
Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Implement the /:ticker route**

Add this route after the `GET /` handler in `packages/api/src/routes/companies.ts`:

```typescript
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @daily-newsletter/api test`
Expected: All tests PASS.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/companies.ts packages/api/src/__tests__/companies.test.ts
git commit -m "feat: add GET /api/companies/:ticker endpoint with paginated articles"
```

---

### Task 3: Add quote and chart proxy endpoints

**Files:**
- Modify: `packages/api/src/routes/companies.ts`

- [ ] **Step 1: Add the quote proxy endpoint**

Add after the `/:ticker` route in `packages/api/src/routes/companies.ts`:

```typescript
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
    const res = await fetch(`https://api.e24.no/bors/v2/instruments/${ticker}.OSE`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
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
```

- [ ] **Step 2: Add the chart proxy endpoint**

Add after the quote route:

```typescript
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
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @daily-newsletter/api test`
Expected: All existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/companies.ts
git commit -m "feat: add quote and chart proxy endpoints for E24 and Yahoo Finance"
```

---

### Task 4: Install dependencies and add API client functions

**Files:**
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Install recharts and shadcn chart**

```bash
cd packages/web && pnpm add recharts && npx shadcn@latest add chart && cd ../..
```

- [ ] **Step 2: Extend the API client**

Replace `packages/web/src/api/client.ts` with the updated version. The key changes: make `fetchCompanies` date optional, add new types and functions:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || "";

export interface Company {
  ticker: string;
  name: string;
}

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

export interface CompanyArticle {
  id: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string | null;
}

export interface CompanyDetail {
  ticker: string;
  name: string;
  articles: CompanyArticle[];
}

export interface CompanyQuote {
  price: number | null;
  currency: string;
  changeIntraDay: number | null;
  changePctIntraDay: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  marketCap: number | null;
  peValue: number | null;
  analysts: {
    buy: number;
    overweight: number;
    hold: number;
    underweight: number;
    sell: number;
  };
  topOwners: { investor: string; percentageOfTotal: number }[];
}

export interface ChartData {
  timestamps: number[];
  close: number[];
  volume: number[];
}

export interface NewsletterEdition {
  id: string;
  date: string;
  summary: string | null;
  status: string;
  createdAt: string;
  articles: Article[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export async function fetchEdition(
  date: string,
  company?: string,
): Promise<NewsletterEdition | null> {
  const params = new URLSearchParams();
  if (company) params.set("company", company);
  const query = params.toString();
  const url = `${API_BASE}/api/newsletters/${date}${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch edition: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchEditions(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<Omit<NewsletterEdition, "articles">>> {
  const res = await fetch(`${API_BASE}/api/newsletters?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Failed to fetch editions: ${res.statusText}`);
  return res.json();
}

export async function fetchCompanies(date?: string): Promise<Company[]> {
  const url = date
    ? `${API_BASE}/api/companies?date=${date}`
    : `${API_BASE}/api/companies`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

export async function fetchCompanyDetail(
  ticker: string,
  limit = 20,
  offset = 0,
): Promise<{ data: CompanyDetail; pagination: { limit: number; offset: number; total: number } }> {
  const res = await fetch(
    `${API_BASE}/api/companies/${ticker}?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch company detail: ${res.statusText}`);
  return res.json();
}

export async function fetchCompanyQuote(ticker: string): Promise<CompanyQuote> {
  const res = await fetch(`${API_BASE}/api/companies/${ticker}/quote`);
  if (!res.ok) throw new Error(`Failed to fetch quote: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchCompanyChart(ticker: string, range = "1d"): Promise<ChartData> {
  const res = await fetch(`${API_BASE}/api/companies/${ticker}/chart?range=${range}`);
  if (!res.ok) throw new Error(`Failed to fetch chart: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/components/ui/ packages/web/package.json pnpm-lock.yaml
git commit -m "feat: add API client functions and install recharts/chart deps"
```

---

### Task 5: Create NavigationDrawer component

**Files:**
- Create: `packages/web/src/components/NavigationDrawer.tsx`
- Modify: `packages/web/src/pages/NewsletterPage.tsx`

- [ ] **Step 1: Create the NavigationDrawer component**

Create `packages/web/src/components/NavigationDrawer.tsx`:

```tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Menu, Newspaper, TrendingUp } from "lucide-react";

const NAV_ITEMS = [
  { label: "Nyheter", path: "/", icon: Newspaper },
  { label: "Aksjer", path: "/companies", icon: TrendingUp },
];

export default function NavigationDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/" || /^\/\d{4}-\d{2}-\d{2}$/.test(location.pathname);
    return location.pathname.startsWith(path);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="p-2 -ml-2 text-ink-secondary hover:text-ink transition-colors">
          <Menu size={20} />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Navigasjon</DrawerTitle>
        </DrawerHeader>
        <nav className="px-4 pb-8">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-accent-light text-accent font-semibold"
                    : "text-ink-secondary hover:bg-surface-raised"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Add NavigationDrawer to NewsletterPage header**

In `packages/web/src/pages/NewsletterPage.tsx`, add the import at the top:

```typescript
import NavigationDrawer from "../components/NavigationDrawer";
```

Then find the mobile header section (the `<div className="sm:hidden">` block that contains the date drawer trigger) and add the `NavigationDrawer` at the start of the header bar. The exact location depends on the current header structure — add it as the leftmost element in the mobile header row.

Look for the header area that currently shows the title "Dagens Nyheter" or similar, and add `<NavigationDrawer />` before the title.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Visually verify**

Run: `pnpm dev:web` and check on mobile viewport that the hamburger icon appears and the drawer opens with "Nyheter" and "Aksjer" options. "Nyheter" should be highlighted as active.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/NavigationDrawer.tsx packages/web/src/pages/NewsletterPage.tsx
git commit -m "feat: add navigation drawer with hamburger menu"
```

---

### Task 6: Create CompanyListPage

**Files:**
- Create: `packages/web/src/pages/CompanyListPage.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Create the company list page**

Create `packages/web/src/pages/CompanyListPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fetchCompanies } from "../api/client";
import type { Company } from "../api/client";
import NavigationDrawer from "../components/NavigationDrawer";
import { Search, ChevronRight } from "lucide-react";

export default function CompanyListPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? companies.filter(
        (c) =>
          c.ticker.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : companies;

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <NavigationDrawer />
          <h1 className="text-lg font-semibold text-ink">Aksjer</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="text"
            placeholder="Søk etter selskap..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-light bg-surface-raised py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border-light bg-surface-raised p-4">
                <div className="h-4 w-16 rounded bg-border-light mb-1.5" />
                <div className="h-3 w-32 rounded bg-border-light" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((c) => (
              <button
                key={c.ticker}
                onClick={() => navigate(`/companies/${c.ticker}`)}
                className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface-raised"
              >
                <div>
                  <div className="font-semibold text-ink">{c.ticker}</div>
                  <div className="text-xs text-ink-tertiary">{c.name}</div>
                </div>
                <ChevronRight size={16} className="text-ink-tertiary" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-tertiary">
                Ingen selskaper funnet
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add routes in App.tsx**

Replace `packages/web/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import ErrorBoundary from "./components/ErrorBoundary";
import NewsletterPage from "./pages/NewsletterPage";
import CompanyListPage from "./pages/CompanyListPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<NewsletterPage />} />
          <Route path="/:date" element={<NewsletterPage />} />
          <Route path="/companies" element={<CompanyListPage />} />
          <Route path="/companies/:ticker" element={<CompanyDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

Note: `CompanyDetailPage` doesn't exist yet — create a placeholder file to avoid import errors:

Create `packages/web/src/pages/CompanyDetailPage.tsx`:

```tsx
export default function CompanyDetailPage() {
  return <div>Loading...</div>;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/CompanyListPage.tsx packages/web/src/pages/CompanyDetailPage.tsx packages/web/src/App.tsx
git commit -m "feat: add company list page with search and routing"
```

---

### Task 7: Create PriceChart component

**Files:**
- Create: `packages/web/src/components/PriceChart.tsx`

- [ ] **Step 1: Create the price chart component**

Create `packages/web/src/components/PriceChart.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { fetchCompanyChart } from "../api/client";

const RANGES = ["1d", "5d", "1mo", "6mo", "1y", "5y"] as const;

const RANGE_LABELS: Record<string, string> = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1Y",
  "5y": "5Y",
};

interface PriceChartProps {
  ticker: string;
}

interface ChartPoint {
  time: string;
  price: number;
}

function formatTimestamp(ts: number, range: string): string {
  const date = new Date(ts * 1000);
  if (range === "1d" || range === "5d") {
    return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1mo" || range === "6mo") {
    return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("nb-NO", { month: "short", year: "2-digit" });
}

export default function PriceChart({ ticker }: PriceChartProps) {
  const [range, setRange] = useState<string>("1d");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchCompanyChart(ticker, range)
      .then((chart) => {
        const points: ChartPoint[] = chart.timestamps
          .map((ts, i) => ({
            time: formatTimestamp(ts, range),
            price: chart.close[i],
          }))
          .filter((p) => p.price != null);
        setData(points);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticker, range]);

  const chartConfig = {
    price: {
      label: "Kurs",
      color: "var(--color-accent)",
    },
  };

  return (
    <div>
      {/* Range selector */}
      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              range === r
                ? "bg-ink text-surface"
                : "text-ink-tertiary hover:text-ink"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-tertiary">
          Kan ikke laste graf
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={10}
              stroke="var(--color-ink-tertiary)"
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={10}
              stroke="var(--color-ink-tertiary)"
              domain={["dataMin", "dataMax"]}
              width={45}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/PriceChart.tsx
git commit -m "feat: add price chart component with range selector"
```

---

### Task 8: Create CompanyDetailPage

**Files:**
- Modify: `packages/web/src/pages/CompanyDetailPage.tsx`

- [ ] **Step 1: Implement the full detail page**

Replace the placeholder `packages/web/src/pages/CompanyDetailPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  fetchCompanyDetail,
  fetchCompanyQuote,
} from "../api/client";
import type { CompanyDetail, CompanyQuote, CompanyArticle } from "../api/client";
import PriceChart from "../components/PriceChart";
import { ArrowLeft } from "lucide-react";

function formatNumber(n: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)} brd`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function sourceColor(source: string): string {
  if (source === "E24") return "text-source-e24";
  if (source === "Økonomi24") return "text-source-okonomi24";
  return "text-ink-tertiary";
}

export default function CompanyDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [quote, setQuote] = useState<CompanyQuote | null>(null);
  const [articles, setArticles] = useState<CompanyArticle[]>([]);
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, total: 0 });
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!ticker) return;

    setLoadingDetail(true);
    setLoadingQuote(true);

    fetchCompanyDetail(ticker)
      .then((res) => {
        setDetail(res.data);
        setArticles(res.data.articles);
        setPagination(res.pagination);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));

    fetchCompanyQuote(ticker)
      .then(setQuote)
      .catch(() => {})
      .finally(() => setLoadingQuote(false));
  }, [ticker]);

  const loadMore = async () => {
    if (!ticker || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextOffset = pagination.offset + pagination.limit;
      const res = await fetchCompanyDetail(ticker, pagination.limit, nextOffset);
      setArticles((prev) => [...prev, ...res.data.articles]);
      setPagination(res.pagination);
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = pagination.offset + pagination.limit < pagination.total;

  const isPositive = (quote?.changeIntraDay ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/companies")}
            className="p-1 text-ink-secondary hover:text-ink transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">{ticker}</h1>
            {detail && (
              <p className="text-xs text-ink-tertiary">{detail.name}</p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl">
        {/* Price Hero */}
        <div className="border-b border-border-light px-4 py-4">
          {loadingQuote ? (
            <div className="animate-pulse">
              <div className="h-8 w-32 rounded bg-border-light mb-2" />
              <div className="h-5 w-24 rounded bg-border-light" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-ink">
                  {quote.price?.toFixed(2) ?? "–"}
                </span>
                <span className="text-sm text-ink-tertiary">{quote.currency}</span>
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isPositive
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {quote.changeIntraDay?.toFixed(2) ?? "0"} ({isPositive ? "+" : ""}
                  {quote.changePctIntraDay?.toFixed(2) ?? "0"}%)
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* Chart */}
        {ticker && (
          <div className="border-b border-border-light px-4 py-4">
            <PriceChart ticker={ticker} />
          </div>
        )}

        {/* Key Metrics */}
        {quote && (
          <div className="border-b border-border-light px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Nøkkeltall</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Markedsverdi", value: formatNumber(quote.marketCap) },
                { label: "P/E", value: quote.peValue?.toFixed(2) ?? "–" },
                { label: "Volum", value: formatNumber(quote.volume) },
                {
                  label: "Høy / Lav",
                  value: `${quote.high?.toFixed(1) ?? "–"} / ${quote.low?.toFixed(1) ?? "–"}`,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-border-light bg-surface-raised p-3"
                >
                  <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-ink">{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analyst Recommendations */}
        {quote && (
          <div className="border-b border-border-light px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Analytikere</h2>
            {(() => {
              const a = quote.analysts;
              const total = a.buy + a.overweight + a.hold + a.underweight + a.sell;
              if (total === 0) return <p className="text-sm text-ink-tertiary">Ingen data</p>;
              const segments = [
                { count: a.buy, bg: "bg-green-600", text: "text-white" },
                { count: a.overweight, bg: "bg-green-300", text: "text-green-900" },
                { count: a.hold, bg: "bg-amber-400", text: "text-amber-900" },
                { count: a.underweight, bg: "bg-red-300", text: "text-red-900" },
                { count: a.sell, bg: "bg-red-500", text: "text-white" },
              ];
              return (
                <>
                  <div className="flex h-6 overflow-hidden rounded-md">
                    {segments.map((s, i) =>
                      s.count > 0 ? (
                        <div
                          key={i}
                          className={`flex items-center justify-center text-[10px] font-semibold ${s.bg} ${s.text}`}
                          style={{ flex: s.count }}
                        >
                          {s.count}
                        </div>
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1.5 flex justify-between text-[9px] text-ink-tertiary">
                    <span>Kjøp</span>
                    <span>Overvekt</span>
                    <span>Hold</span>
                    <span>Undervekt</span>
                    <span>Selg</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Top Owners */}
        {quote && quote.topOwners.length > 0 && (
          <div className="border-b border-border-light px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Største eiere</h2>
            <div className="space-y-2">
              {quote.topOwners.map((o) => (
                <div
                  key={o.investor}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink">{o.investor}</span>
                  <span className="font-semibold text-ink-secondary">
                    {o.percentageOfTotal.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Articles */}
        <div className="px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Relaterte artikler</h2>
          {loadingDetail ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-border-light bg-surface-raised p-3">
                  <div className="h-4 w-3/4 rounded bg-border-light mb-2" />
                  <div className="h-3 w-1/3 rounded bg-border-light" />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-ink-tertiary">Ingen artikler funnet</p>
          ) : (
            <>
              <div className="space-y-2">
                {articles.map((a) => (
                  <a
                    key={a.id}
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border-light bg-surface-raised p-3 transition-colors hover:border-border"
                  >
                    <div className="text-sm font-semibold text-ink">{a.title}</div>
                    <div className="mt-1 flex gap-2 text-xs">
                      <span className={`font-semibold ${sourceColor(a.sourceName)}`}>
                        {a.sourceName}
                      </span>
                      <span className="text-ink-tertiary">{formatDate(a.publishedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-raised disabled:opacity-50"
                >
                  {loadingMore ? "Laster..." : "Last flere artikler"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/CompanyDetailPage.tsx
git commit -m "feat: implement company detail page with quote, chart, and articles"
```

---

### Task 9: Lint and final verification

**Files:** All modified files

- [ ] **Step 1: Run full quality checks**

Run: `pnpm check`
Expected: Lint and typecheck pass with no errors.

- [ ] **Step 2: Fix any lint issues**

Run: `pnpm lint:fix` if there are lint errors from step 1.

- [ ] **Step 3: Format code**

Run: `pnpm format`

- [ ] **Step 4: Commit if any changes**

```bash
git add packages/api/src/routes/companies.ts packages/api/src/__tests__/companies.test.ts packages/web/src/
git commit -m "chore: lint and format"
```

- [ ] **Step 5: Visual smoke test**

Run `pnpm dev` and verify:
1. Hamburger menu appears on newsletter page, drawer opens with Nyheter/Aksjer
2. `/companies` shows searchable list, search filters work
3. Tapping a company navigates to `/companies/:ticker`
4. Detail page loads with price, chart, metrics, analysts, owners, articles
5. Chart range buttons switch between 1D/5D/1M/6M/1Y/5Y
6. "Load more" button loads additional articles
7. Back arrow returns to company list
