# Oslo Bors Ticker Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a daily pg-boss job that scrapes Oslo Bors tickers from StockAnalysis.com and upserts them into the `company` table.

**Architecture:** Standalone pg-boss job (`ticker-sync`) running on a daily cron, independent from the article pipeline. Extends the existing `company` table with `exchange`, `lastSeenAt`, and `isActive` columns. A new API endpoint allows manual triggering.

**Tech Stack:** pg-boss, Drizzle ORM, PostgreSQL, Hono

**Spec:** `docs/superpowers/specs/2026-03-18-ticker-sync-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/api/src/db/schema.ts` | Add `exchange`, `lastSeenAt`, `isActive` columns to `company` table |
| `packages/worker/src/db/schema.ts` | Mirror the same schema changes |
| `packages/worker/src/ticker-sync.ts` | New — scrape, parse, upsert, deactivate logic |
| `packages/worker/src/index.ts` | Register and schedule the `ticker-sync` job |
| `packages/api/src/routes/tickers.ts` | New — `POST /trigger` endpoint |
| `packages/api/src/index.ts` | Register the tickers route |

---

### Task 1: Extend company table schema

**Files:**
- Modify: `packages/api/src/db/schema.ts:41-46`
- Modify: `packages/worker/src/db/schema.ts:41-46`

- [ ] **Step 1: Add new columns to API schema**

In `packages/api/src/db/schema.ts`, add `boolean` to the import from `drizzle-orm/pg-core`, then add three columns to the `company` table:

```typescript
import { pgTable, uuid, text, timestamp, pgEnum, integer, unique, boolean } from "drizzle-orm/pg-core";

// ... existing tables unchanged ...

export const company = pgTable("company", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticker: text("ticker").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Mirror changes in worker schema**

Apply the identical changes to `packages/worker/src/db/schema.ts` — same import addition, same three columns on `company`.

- [ ] **Step 3: Generate Drizzle migration**

Run: `pnpm db:generate`
Expected: A new SQL migration file is created in the `drizzle/` directory with `ALTER TABLE` statements adding the three columns.

- [ ] **Step 4: Apply migration**

Run: `pnpm db:migrate`
Expected: Migration applies successfully. Existing rows get `null` for `exchange` and `lastSeenAt`, `true` for `isActive`.

- [ ] **Step 5: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/db/schema.ts packages/worker/src/db/schema.ts drizzle/
git commit -m "feat: add exchange, isActive, lastSeenAt columns to company table"
```

---

### Task 2: Implement ticker sync job

**Files:**
- Create: `packages/worker/src/ticker-sync.ts`

- [ ] **Step 1: Create the ticker sync module**

Create `packages/worker/src/ticker-sync.ts` with the following implementation:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/worker/src/ticker-sync.ts
git commit -m "feat: add ticker sync job for Oslo Bors"
```

---

### Task 3: Register and schedule the job

**Files:**
- Modify: `packages/worker/src/index.ts:1-10` (imports and constants)
- Modify: `packages/worker/src/index.ts:17-23` (queue creation)
- Modify: `packages/worker/src/index.ts:64-67` (after last worker, before schedule)

- [ ] **Step 1: Add import and constant**

At the top of `packages/worker/src/index.ts`, add the import and constant:

```typescript
import { syncTickers } from "./ticker-sync.js";
const TICKER_SYNC_JOB = "ticker-sync";
```

- [ ] **Step 2: Create the queue**

After the existing `boss.createQueue(SUMMARIZE_EDITION_JOB)` line (line 23), add:

```typescript
await boss.createQueue(TICKER_SYNC_JOB);
```

- [ ] **Step 3: Register the worker**

After the last `boss.work(SUMMARIZE_EDITION_JOB, ...)` block (after line 64), add:

```typescript
await boss.work(TICKER_SYNC_JOB, async () => {
  console.log("Starting ticker sync...");
  const result = await syncTickers();
  console.log(
    `Ticker sync complete: ${result.total} total, ${result.upserted} upserted, ${result.deactivated} deactivated`,
  );
});
```

- [ ] **Step 4: Schedule the job**

After the existing `boss.schedule(FETCH_JOB, ...)` line (line 66), add:

```typescript
await boss.schedule(TICKER_SYNC_JOB, "0 6 * * *", { retryLimit: 3, retryDelay: 60 });
console.log(`Scheduled ${TICKER_SYNC_JOB} with cron: 0 6 * * *`);
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/worker/src/index.ts
git commit -m "feat: register and schedule ticker-sync job"
```

---

### Task 4: Add API trigger endpoint

**Files:**
- Create: `packages/api/src/routes/tickers.ts`
- Modify: `packages/api/src/index.ts:6-8` (imports) and `packages/api/src/index.ts:19-21` (route registration)

- [ ] **Step 1: Create the tickers route**

Create `packages/api/src/routes/tickers.ts`:

```typescript
import { Hono } from "hono";
import { getQueue } from "../queue.js";

const app = new Hono();

app.post("/trigger", async (c) => {
  const queue = await getQueue();
  const jobId = await queue.send("ticker-sync", {}, { retryLimit: 3, retryDelay: 60 });

  if (!jobId) {
    return c.json({ error: "Failed to queue job. A job may already be pending." }, 409);
  }

  return c.json({ message: "Ticker sync triggered", jobId }, 201);
});

export default app;
```

- [ ] **Step 2: Register the route**

In `packages/api/src/index.ts`, add the import:

```typescript
import tickers from "./routes/tickers.js";
```

And register the route after the existing `app.route` calls (after line 21):

```typescript
app.route("/api/tickers", tickers);
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/tickers.ts packages/api/src/index.ts
git commit -m "feat: add POST /api/tickers/trigger endpoint"
```

---

### Task 5: Lint and final verification

**Files:** All modified files

- [ ] **Step 1: Run full quality checks**

Run: `pnpm check`
Expected: Lint and typecheck pass with no errors.

- [ ] **Step 2: Fix any lint issues**

Run: `pnpm lint:fix` if there are lint errors from step 1.

- [ ] **Step 3: Format code**

Run: `pnpm format`

- [ ] **Step 4: Commit if any formatting changes**

Stage only the files modified in this plan, then commit:

```bash
git add packages/api/src/db/schema.ts packages/worker/src/db/schema.ts packages/worker/src/ticker-sync.ts packages/worker/src/index.ts packages/api/src/routes/tickers.ts packages/api/src/index.ts
git commit -m "chore: lint and format"
```
