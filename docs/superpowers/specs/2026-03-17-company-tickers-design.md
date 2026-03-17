# Company Tickers — Design Spec

## Goal

Extract company tickers from E24 RSS feed items, store them with resolved company names, associate them with articles, and enable server-side filtering by company. Display company chips on article cards in the frontend.

## Data Model

### New tables

Added to **both** `packages/api/src/db/schema.ts` and `packages/worker/src/db/schema.ts` (schema is duplicated per existing pattern).

**`company`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default random |
| `ticker` | text | NOT NULL, UNIQUE (e.g. `EQNR.OSE`) |
| `name` | text | NOT NULL (e.g. `EQUINOR`) |
| `createdAt` | timestamp w/ tz | NOT NULL, default now |

**`article_company`** (composite PK on `articleId` + `companyId`, following `editionArticle` pattern)
| Column | Type | Constraints |
|---|---|---|
| `articleId` | uuid FK → article.id | NOT NULL, ON DELETE CASCADE |
| `companyId` | uuid FK → company.id | NOT NULL, ON DELETE CASCADE |
| UNIQUE on (articleId, companyId) | | |

Schema is applied via `pnpm db:push` (no migration files, matching current workflow).

## Worker Changes (`packages/worker`)

### RSS parsing (`article-fetcher.ts`)

- Add `companies` as a custom field in the RSS parser config. The E24 RSS uses nested `<company>` tags inside `<companies>`:
  ```xml
  <companies><company>EQNR.OSE</company><company>STL.OSE</company></companies>
  ```
- Extend `FetchedArticle` with `tickers: string[]`
- Parse each item's `companies` field to extract ticker strings. Items without a `<companies>` tag get an empty array.

### Company name resolution (new: `company-lookup.ts`)

- `async function resolveCompany(ticker: string): Promise<{ticker: string, name: string}>`
- Check DB first — if company with this ticker exists, return it (no fetch)
- Otherwise, fetch `https://e24.no/bors/instrument/{ticker}` and extract `"name"` from the JSON-LD Corporation schema: `{"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}`
- Insert into `company` table and return
- On any fetch/parse failure: use the ticker itself as the name (fallback), still insert so we don't retry on every run
- Calls are sequential (one at a time) to avoid hammering E24. Since lookups are cached in DB, this only matters on first encounter of each ticker.

### Article-company linking (`article-fetcher.ts`)

- After inserting an article (when `result.rowCount > 0`), for each ticker in the item:
  1. Call `resolveCompany(ticker)` to get or create the company
  2. Insert into `article_company` with `onConflictDoNothing`
- Only runs when `sourceName === "E24"` (the `FeedSource.name` field). Other sources and scrapers don't produce tickers.
- Articles without any tickers still appear normally — they just have an empty companies array.

## API Changes (`packages/api`)

### `GET /api/newsletters/:date` — include companies on articles

- Join `article_company` → `company` when building the article response
- Each article gets `companies: Array<{ticker: string, name: string}>`
- Articles with no companies get an empty array

### `GET /api/newsletters/:date?company=EQNR.OSE` — server-side filter

- Optional `company` query param (single ticker string)
- When present, filter the edition's articles to only those linked to the given company via an INNER JOIN on `article_company` + `company` WHERE `company.ticker = ?`
- Returns the same response shape, just filtered
- If the ticker doesn't match any articles, returns the edition with an empty `articles` array (not a 404)
- Invalid/malformed ticker: returns empty articles (no validation error — it simply won't match)

### `GET /api/companies` — new route file (`routes/companies.ts`)

- Query param: `date` (required, YYYY-MM-DD format, validated same as newsletters)
- Returns companies that appear in the given edition's articles, joined through `editionArticle` → `article_company` → `company`
- Response: `{ data: Array<{ticker: string, name: string}> }`, sorted alphabetically by name, deduplicated
- If date is missing or invalid: 400
- If no edition found: returns `{ data: [] }`

## Frontend Changes (`packages/web`)

### Types (`api/client.ts`)

- Add `Company` type: `{ticker: string, name: string}`
- Add `companies: Company[]` to `Article` type
- Add `fetchCompanies(date: string): Promise<Company[]>` API function
- Update `fetchEdition` to accept optional `company` param: `fetchEdition(date, company?)`

### `ArticleCard.tsx`

- Render company chips below the article metadata
- Each chip shows the company name
- Clicking the chip name sets `?company=TICKER` in the URL (triggers server-side filter via parent)
- A small external-link icon on each chip opens `https://e24.no/bors/instrument/{ticker}` in a new tab (using `e.stopPropagation()` to prevent the card link)
- Articles with no companies render normally without chips

### `NewsletterPage.tsx`

- Fetch companies list for the current date via `fetchCompanies(date)`
- Render a filter bar above the articles showing all companies as selectable chips
- Read `?company=` from URL search params; pass to `fetchEdition(date, company)`
- Active company filter shown as highlighted chip with an "x" to clear
- Clearing the filter removes the query param and refetches all articles
- Filter bar hidden when no companies exist for the edition

## Testing

### Setup

- Add `vitest` as a dev dependency at the root
- Configure `vitest.config.ts` at root
- Add `"test"` script to root `package.json`
- Tests use mocked DB and mocked `fetch` (no real database or network calls)

### Worker tests (`packages/worker/src/__tests__/`)

**`company-lookup.test.ts`**
- Test: extracts company name from HTML containing JSON-LD Corporation schema (mock fetch)
- Test: falls back to ticker as name when fetch fails
- Test: returns existing company from DB without fetching (mock DB query)

**`article-fetcher.test.ts`**
- Test: parses tickers from RSS items with `<companies>` tag
- Test: handles items without `<companies>` tag (empty tickers array)
- Test: creates article-company links after inserting article

### API tests (`packages/api/src/__tests__/`)

**`newsletters.test.ts`**
- Test: `GET /:date` includes companies array on each article
- Test: `GET /:date?company=EQNR.OSE` returns only articles linked to that company
- Test: `GET /:date?company=NONEXIST` returns edition with empty articles array

**`companies.test.ts`**
- Test: `GET /companies?date=YYYY-MM-DD` returns deduplicated, sorted companies for that edition
- Test: `GET /companies` without date param returns 400
- Test: `GET /companies?date=YYYY-MM-DD` with no edition returns empty array

## Non-goals

- Okonomi24 company extraction (planned separately)
- Multi-company filter (single ticker filter is sufficient for now)
- Company search/autocomplete
