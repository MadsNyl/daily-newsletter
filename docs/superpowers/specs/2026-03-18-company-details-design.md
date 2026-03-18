# Company Details Page — Design Spec

## Summary

A mobile-first company browsing experience: a hamburger drawer menu for navigation, a searchable list of all active Oslo Bors tickers, and a detail page per company showing live price data, a chart with 6 time ranges, key metrics, analyst recommendations, top owners, and related articles.

## Data Sources

| Source | URL Pattern | Data |
|--------|------------|------|
| Our API | `GET /api/companies` (no date param) | All active companies (list page) |
| Our API | `GET /api/companies/:ticker` | Company info + related articles |
| E24 API | `GET https://api.e24.no/bors/v2/instruments/{TICKER}.OSE` | Price, metrics, analysts, owners |
| Yahoo Finance | `GET https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}.OL?range={range}&interval={interval}` | OHLCV time-series for chart |

E24 and Yahoo Finance are fetched directly from the frontend (no backend proxy).

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

### Tests

Extend `packages/api/src/__tests__/companies.test.ts` using the existing `makeSelectChain` mock pattern:

- `GET /companies` (no date): returns all active companies
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
3. **Chart** — area chart (shadcn/recharts) with range selector buttons (1D, 5D, 1M, 6M, 1Y, 5Y). Default range: 1D. Fetches from Yahoo Finance on range change.
4. **Key metrics** — 2x2 grid: market cap, P/E ratio, volume, high/low. From E24 ticker data.
5. **Analyst recommendations** — horizontal stacked bar showing buy/overweight/hold/underweight/sell counts. From E24 tickerExtra data.
6. **Top owners** — top 5 shareholders with percentage. From E24 topOwners data.
7. **Related articles** — cards with title, source badge, date. From our API. Tap opens source URL. Paginated with "Load more" button.

Each data source loads independently — the page shows skeleton placeholders that fill in as data arrives.

### New API Client Functions

In `api/client.ts`:

```typescript
fetchAllCompanies(): Promise<Company[]>
fetchCompanyDetail(ticker: string, limit?: number, offset?: number): Promise<CompanyDetail>
```

### Price Chart Component

New component: `components/PriceChart.tsx`

- Accepts `ticker` prop
- Manages selected range state (default: "1d")
- Fetches Yahoo Finance data on mount and range change
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
| `packages/api/src/routes/companies.ts` | Extend GET / (no date), add GET /:ticker |
| `packages/api/src/__tests__/companies.test.ts` | Add tests for new endpoints |
| `packages/web/src/App.tsx` | Add /companies and /companies/:ticker routes |
| `packages/web/src/api/client.ts` | Add fetchAllCompanies, fetchCompanyDetail |
| `packages/web/src/pages/CompanyListPage.tsx` | New — searchable company list |
| `packages/web/src/pages/CompanyDetailPage.tsx` | New — company detail with chart, metrics, articles |
| `packages/web/src/pages/NewsletterPage.tsx` | Add NavigationDrawer to header |
| `packages/web/src/components/NavigationDrawer.tsx` | New — hamburger drawer menu |
| `packages/web/src/components/PriceChart.tsx` | New — area chart with range selector |

## Out of Scope

- Backend proxy for E24/Yahoo data
- Price data caching
- Real-time/websocket price updates
- Desktop-specific layouts (mobile-first, responsive enough for desktop)
- Finance calendar or stock notices from E24
