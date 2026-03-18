# Oslo Bors Ticker Sync — Design Spec

## Summary

A daily pg-boss job that scrapes the current list of Oslo Bors tickers from StockAnalysis.com and upserts them into the existing `company` table. Runs independently from the article pipeline.

## Schema Changes

Extend the `company` table with three new columns (both `packages/api/src/db/schema.ts` and `packages/worker/src/db/schema.ts`):

| Column       | Type                       | Nullable | Default | Notes                          |
| ------------ | -------------------------- | -------- | ------- | ------------------------------ |
| `exchange`   | `text`                     | yes      | `null`  | e.g. `"OSL"`                   |
| `lastSeenAt` | `timestamp with time zone` | yes      | `null`  | Updated on every sync run      |
| `isActive`   | `boolean`                  | no       | `true`  | Set to `false` if delisted     |

Existing rows (created by `resolveCompany()`) get `null` exchange, `null` lastSeenAt, and `true` isActive. No breaking changes.

A Drizzle migration is generated via `pnpm db:generate`.

## Ticker Sync Job

New file: `packages/worker/src/ticker-sync.ts`

### Flow

1. Fetch HTML from `https://stockanalysis.com/list/oslo-bors/` with a browser-like `User-Agent` header and `AbortSignal.timeout(10000)`.
2. Extract ticker/company pairs via regex: `{no:\d+,s:"osl\/([^"]+)",n:"([^"]+)"`.
3. **Guard:** Throw if fewer than 100 tickers extracted (scraper breakage detection). No DB writes happen.
4. Record the current timestamp as `syncTimestamp`.
5. Inside a single database transaction:
   a. Batch upsert all scraped tickers into the `company` table (single query with `.values([...])` + `.onConflictDoUpdate`):
      - **Insert** if new: `ticker`, `name`, `exchange: "OSL"`, `isActive: true`, `lastSeenAt: syncTimestamp`.
      - **On conflict** (ticker): update `lastSeenAt: syncTimestamp`, `name`, `isActive: true`.
   b. Set `isActive = false` for companies where `exchange = "OSL"` AND `lastSeenAt < syncTimestamp`.
6. Return `{ total: number, upserted: number, deactivated: number }`.

### Registration

In `packages/worker/src/index.ts`:

- Create queue: `ticker-sync`
- Register handler: `boss.work("ticker-sync", tickerSync)`
- Schedule: `boss.schedule("ticker-sync", "0 6 * * *", { retryLimit: 3, retryDelay: 60 })` — daily at 06:00 UTC

## API Endpoint

New file: `packages/api/src/routes/tickers.ts`

- `POST /api/tickers/trigger` — uses `getQueue()` from `../queue.js` to send the `ticker-sync` job with `{ retryLimit: 3, retryDelay: 60 }` options. Returns `{ jobId }` with 201 status, or 409 if job is already queued (null jobId).

Registered in `packages/api/src/index.ts` via `app.route()`.

## Error Handling

- **Network failures:** `AbortSignal.timeout(10000)` on fetch. pg-boss retries (3 attempts, 60s delay) handle transient failures.
- **Scraper breakage:** If regex yields < 100 tickers, throw before any DB writes. Job is marked failed by pg-boss.
- **Race conditions:** `onConflictDoUpdate` on `company.ticker` handles concurrent inserts.
- **Existing companies:** Deactivation only targets `exchange = "OSL"` rows, so companies without an exchange (created by `resolveCompany()`) are unaffected.

## Files Changed

| File                                    | Change                            |
| --------------------------------------- | --------------------------------- |
| `packages/api/src/db/schema.ts`         | Add columns to `company` table    |
| `packages/worker/src/db/schema.ts`      | Add columns to `company` table    |
| `packages/worker/src/ticker-sync.ts`    | New — ticker sync job logic       |
| `packages/worker/src/index.ts`          | Register and schedule new job     |
| `packages/api/src/routes/tickers.ts`    | New — manual trigger endpoint     |
| `packages/api/src/index.ts`             | Register tickers route            |

## Out of Scope

- Fetching price data or fundamentals
- Other exchanges
- UI changes
