# Company Tickers — Design Spec

## Goal

Extract company tickers from E24 RSS feed items, store them with resolved company names, associate them with articles, and enable server-side filtering by company. Display company chips on article cards in the frontend.

## Data Model

### New tables (both `packages/api/src/db/schema.ts` and `packages/worker/src/db/schema.ts`)

**`company`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default random |
| `ticker` | text | NOT NULL, UNIQUE (e.g. `EQNR.OSE`) |
| `name` | text | NOT NULL (e.g. `EQUINOR`) |
| `createdAt` | timestamp w/ tz | NOT NULL, default now |

**`article_company`**
| Column | Type | Constraints |
|---|---|---|
| `articleId` | uuid FK → article.id | NOT NULL, ON DELETE CASCADE |
| `companyId` | uuid FK → company.id | NOT NULL, ON DELETE CASCADE |
| UNIQUE on (articleId, companyId) | | |

## Worker Changes (`packages/worker`)

### RSS parsing (`article-fetcher.ts`)

- Add `companies` as a custom field in the RSS parser config (nested `<company>` tags inside `<companies>`)
- Extend `FetchedArticle` with `tickers: string[]`
- Parse each item's `companies` field to extract ticker strings

### Company name resolution (new: `company-lookup.ts`)

- `async function resolveCompany(ticker: string): Promise<{ticker: string, name: string}>`
- Check DB first — if company with this ticker exists, return it
- Otherwise, fetch `https://e24.no/bors/instrument/{ticker}` and extract `"name"` from the JSON-LD `Corporation` schema (`{"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}`)
- Insert into `company` table and return
- On scrape failure: use the ticker as the name (fallback), still insert so we don't retry

### Article-company linking (`article-fetcher.ts`)

- After inserting an article, for each ticker in the item:
  1. Call `resolveCompany(ticker)` to get or create the company
  2. Insert into `article_company` with `onConflictDoNothing`
- Only applies to E24 feed articles (other sources/scrapers don't have tickers)

## API Changes (`packages/api`)

### `GET /api/newsletters/:date` — include companies on articles

- Join `article_company` → `company` when building the article response
- Each article gets `companies: Array<{ticker: string, name: string}>`

### `GET /api/newsletters/:date?company=EQNR.OSE` — server-side filter

- Optional `company` query param (single ticker string)
- When present, filter the edition's articles to only those linked to the given company via `article_company`
- Returns the same response shape, just filtered

### `GET /api/companies` — new endpoint

- Returns all companies that appear in articles for a given edition date
- Query param: `date` (required, YYYY-MM-DD)
- Response: `{ data: Array<{ticker: string, name: string}> }`
- Used by the frontend filter bar to populate the list of companies

## Frontend Changes (`packages/web`)

### Types (`api/client.ts`)

- Add `Company` type: `{ticker: string, name: string}`
- Add `companies: Company[]` to `Article` type
- Add `fetchCompanies(date: string)` API function

### `ArticleCard.tsx`

- Render company chips below the article metadata
- Each chip shows the company name
- Clicking the chip name navigates with `?company=TICKER` query param (triggers server-side filter)
- A small external-link icon on each chip opens `https://e24.no/bors/instrument/{ticker}` in a new tab (using `e.stopPropagation()` to prevent the card click)

### `NewsletterPage.tsx`

- Fetch companies list for the current date via `fetchCompanies(date)`
- Render a filter bar above the articles showing all companies as selectable chips
- Read `?company=` from URL search params; pass to `fetchEdition(date, company)`
- Active company filter shown as highlighted chip with an "x" to clear
- Clearing the filter removes the query param and refetches

## Testing

### Setup

- Add `vitest` as a dev dependency at the root
- Configure in root `vitest.config.ts`
- Add `"test"` script to root and relevant package `package.json` files

### Worker tests (`packages/worker/src/__tests__/`)

**`company-lookup.test.ts`**
- Test: extracts company name from mock HTML containing JSON-LD Corporation schema
- Test: falls back to ticker as name when fetch fails
- Test: returns existing company from DB without fetching (mock DB)

**`article-fetcher.test.ts`**
- Test: parses tickers from RSS items with `<companies>` tag
- Test: handles items without `<companies>` tag (no tickers)
- Test: creates article-company links for fetched articles

### API tests (`packages/api/src/__tests__/`)

**`newsletters.test.ts`**
- Test: `GET /:date` includes companies array on each article
- Test: `GET /:date?company=EQNR.OSE` returns only articles linked to that company
- Test: `GET /:date?company=NONEXIST` returns empty articles array
- Test: `GET /companies?date=YYYY-MM-DD` returns companies for that edition

## Non-goals

- Okonomi24 company extraction (planned separately)
- Multi-company filter (single ticker filter is sufficient for now)
- Company search/autocomplete
