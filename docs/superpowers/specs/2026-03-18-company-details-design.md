# Company Details Page — Design Spec

## Summary

A mobile-first company browsing experience: a hamburger drawer menu for navigation, a searchable list of all active Oslo Bors tickers, and a detail page per company showing live price data, a chart with 6 time ranges, key metrics, analyst recommendations, top owners, and related articles.

## Data Sources

| Source | URL Pattern | Data |
|--------|------------|------|
| Our API | `GET /api/companies` (no date param) | All active companies (list page) |
| Our API | `GET /api/companies/:ticker` | Company info + related articles |
| Our API | `GET /api/companies/:ticker/quote` | Proxied E24 data (price, metrics, analysts, owners) |
| Our API | `GET /api/companies/:ticker/chart?range=1d` | Proxied Yahoo Finance OHLCV time-series |

E24 and Yahoo Finance are proxied through the backend to avoid CORS issues. The backend fetches from:
- E24: `https://api.e24.no/bors/v2/instruments/{TICKER}.OSE`
- Yahoo: `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}.OL?range={range}&interval={interval}`

The ticker suffix mapping is hardcoded: `.OSE` for E24, `.OL` for Yahoo Finance. This is sufficient since all companies in our DB are Oslo Bors (`exchange = "OSL"`).

### Yahoo Finance Range/Interval Mapping

| Range | Interval |
|-------|----------|
| `1d`  | `5m`     |
| `5d`  | `15m`    |
| `1mo` | `1d`     |
| `6mo` | `1d`     |
| `1y`  | `1d`     |
| `5y`  | `1wk`    |

## Backend Changes

### Extend `GET /api/companies`

Currently requires a `date` query param. When `date` is omitted, return all active companies sorted alphabetically by ticker:

```
GET /api/companies
→ { data: [{ ticker: "DNB", name: "DNB Bank ASA" }, ...] }
```

When `date` is provided, existing behavior is preserved (companies for that edition).

The query for the no-date case: select from `company` where `isActive = true`, ordered by `ticker` ascending.

### New `GET /api/companies/:ticker`

Returns company info and paginated related articles sorted by `publishedAt` descending.

```
GET /api/companies/DNB?limit=20&offset=0
→ {
    data: {
      ticker: "DNB",
      name: "DNB Bank ASA",
      articles: [
        { id, title, summary, sourceUrl, sourceName, thumbnailUrl, publishedAt }
      ]
    },
    pagination: { limit: 20, offset: 0, total: 45 }
  }
```

Query: join `company` → `articleCompany` → `article`, filter by `company.ticker`, order by `article.publishedAt` desc, apply limit/offset. Count total for pagination.

Returns 404 if ticker not found.

Only includes articles with `status = 'SUMMARIZED'` (pending/failed articles have no useful summary).

Default pagination: `limit = 20`, `offset = 0`. Maximum `limit = 100`.

### New `GET /api/companies/:ticker/quote`

Proxies E24 instrument data. Fetches from `https://api.e24.no/bors/v2/instruments/{TICKER}.OSE` and returns a shaped response:

```json
{
  "data": {
    "price": 296.8,
    "currency": "NOK",
    "changeIntraDay": 4.3,
    "changePctIntraDay": 1.47,
    "high": 297.8,
    "low": 292.9,
    "volume": 2272974,
    "marketCap": 438553150000,
    "peValue": 8.56,
    "analysts": {
      "buy": 5, "overweight": 1, "hold": 11, "underweight": 1, "sell": 3
    },
    "topOwners": [
      { "investor": "NÆRINGS- OG FISKERIDEPARTEMENTET", "percentageOfTotal": 34.0 }
    ]
  }
}
```

Returns 502 if E24 is unreachable. Returns 404 if ticker not found in our DB.

### New `GET /api/companies/:ticker/chart`

Proxies Yahoo Finance chart data. Accepts `range` query param (one of: `1d`, `5d`, `1mo`, `6mo`, `1y`, `5y`; default `1d`). Returns the OHLCV time-series:

```json
{
  "data": {
    "timestamps": [1773820800, ...],
    "close": [294.3, ...],
    "volume": [14802, ...]
  }
}
```

Returns only timestamps and close prices (sufficient for an area chart). Returns 502 if Yahoo is unreachable.

### Tests

Extend `packages/api/src/__tests__/companies.test.ts` using the existing `makeSelectChain` mock pattern:

- `GET /companies` (no date): returns all active companies
- `GET /companies` (no date, missing date param): update existing test that expects 400 — now returns 200 with companies
- `GET /companies/:ticker`: returns company + articles
- `GET /companies/:ticker`: returns 404 for unknown ticker
- `GET /companies/:ticker?limit=5`: respects pagination params

## Frontend Changes

### New Routes

In `App.tsx`, add:
- `/companies` → `CompanyListPage`
- `/companies/:ticker` → `CompanyDetailPage`

### Navigation Drawer

New component: `components/NavigationDrawer.tsx`

Hamburger icon in the header of all pages. Opens a drawer with:
- **Nyheter** — links to `/` (current newsletter)
- **Aksjer** — links to `/companies`

Active item highlighted. Uses the existing `Drawer` component from vaul.

Added to both `NewsletterPage` and the new pages.

### Company List Page

New page: `pages/CompanyListPage.tsx`

- Header with hamburger + "Aksjer" title
- Search input filtering tickers and names client-side
- Alphabetical list of all active companies (ticker + name)
- Each row taps through to `/companies/:ticker`
- Fetches from `GET /api/companies` on mount

### Company Detail Page

New page: `pages/CompanyDetailPage.tsx`

Layout from top to bottom:

1. **Header** — back arrow (navigates to `/companies`), ticker, company name
2. **Price hero** — current price in NOK, daily change as green/red badge
3. **Chart** — area chart (shadcn/recharts) with range selector buttons (1D, 5D, 1M, 6M, 1Y, 5Y). Default range: 1D. Fetches from `GET /api/companies/:ticker/chart?range=` on range change.
4. **Key metrics** — 2x2 grid: market cap, P/E ratio, volume, high/low. From `GET /api/companies/:ticker/quote`.
5. **Analyst recommendations** — horizontal stacked bar showing buy/overweight/hold/underweight/sell counts. From quote endpoint.
6. **Top owners** — top 5 shareholders with percentage. From quote endpoint.
7. **Related articles** — cards with title, source badge, date. From `GET /api/companies/:ticker`. Tap opens source URL. Paginated with "Load more" button.

Each data source loads independently — the page shows skeleton placeholders that fill in as data arrives.

### New API Client Functions

In `api/client.ts`:

```typescript
fetchCompanies(date?: string): Promise<Company[]>  // extend existing — date is now optional
fetchCompanyDetail(ticker: string, limit?: number, offset?: number): Promise<CompanyDetail>
fetchCompanyQuote(ticker: string): Promise<CompanyQuote>
fetchCompanyChart(ticker: string, range: string): Promise<ChartData>
```

### Price Chart Component

New component: `components/PriceChart.tsx`

- Accepts `ticker` prop
- Manages selected range state (default: "1d")
- Fetches from `/api/companies/:ticker/chart?range=` on mount and range change
- Renders an area chart using shadcn chart components (Recharts)
- Range selector as a row of pill buttons below the header
- Shows loading spinner during fetch
- Handles errors gracefully (shows "Chart unavailable" message)

### Dependencies to Install

- `recharts` — required by shadcn chart components
- shadcn `chart` component — provides themed chart wrappers

## Files Changed

| File | Change |
|------|--------|
| `packages/api/src/routes/companies.ts` | Extend GET / (no date), add GET /:ticker, /:ticker/quote, /:ticker/chart |
| `packages/api/src/__tests__/companies.test.ts` | Update existing test, add tests for new endpoints |
| `packages/web/src/App.tsx` | Add /companies and /companies/:ticker routes |
| `packages/web/src/api/client.ts` | Extend fetchCompanies (optional date), add fetchCompanyDetail, fetchCompanyQuote, fetchCompanyChart |
| `packages/web/src/pages/CompanyListPage.tsx` | New — searchable company list |
| `packages/web/src/pages/CompanyDetailPage.tsx` | New — company detail with chart, metrics, articles |
| `packages/web/src/pages/NewsletterPage.tsx` | Add NavigationDrawer to header |
| `packages/web/src/components/NavigationDrawer.tsx` | New — hamburger drawer menu |
| `packages/web/src/components/PriceChart.tsx` | New — area chart with range selector |

## Out of Scope

- Price data caching (server-side)
- Real-time/websocket price updates
- Desktop-specific layouts (mobile-first, responsive enough for desktop)
- Finance calendar or stock notices from E24
- Other exchanges beyond Oslo Bors
