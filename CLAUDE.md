# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development - starts API, worker, and web in parallel
pnpm dev

# Individual services
pnpm dev:api        # API on :3000 (tsx watch)
pnpm dev:worker     # Worker with pg-boss (tsx watch)
pnpm dev:web        # Vite dev server on :5173

# Quality checks
pnpm check          # lint + typecheck (run before committing)
pnpm lint           # ESLint across all packages
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Prettier format
pnpm typecheck      # TypeScript type checking

# Database (requires running PostgreSQL)
pnpm db:push        # Push schema to DB (no migration files)
pnpm db:generate    # Generate Drizzle migration files
pnpm db:migrate     # Apply migrations
pnpm db:studio      # Open Drizzle Studio
pnpm db:seed        # Seed sample data

# Docker (for PostgreSQL only in local dev)
docker compose up -d postgres
```

## Architecture

Monorepo (pnpm workspaces) with three packages sharing a PostgreSQL database:

**`packages/api`** — Hono REST API on port 3000. Routes in `src/routes/`. Drizzle ORM schema is the source of truth at `src/db/schema.ts`. Exposes `/api/newsletters`, `/api/articles`, `/api/health`, and `POST /api/newsletters/trigger`.

**`packages/worker`** — pg-boss job pipeline with three chained jobs:
1. `article-fetch` (cron-scheduled) → fetches RSS feeds + scrapes sites → inserts articles
2. `article-summarize` (triggered) → calls Claude Haiku to summarize in Norwegian
3. `edition-build` (triggered) → groups today's summarized articles into a newsletter edition

Article sources are configured in `src/feeds.ts` (RSS) and `src/scrapers/` (web scrapers for sites without RSS).

**`packages/web`** — React 19 + Vite + Tailwind CSS 4. React Router v7 with date-based navigation (`/:date`). The Vite dev server proxies `/api` to `localhost:3000`.

## Key Patterns

- **DB schema is duplicated**: both `packages/api/src/db/schema.ts` and `packages/worker/src/db/schema.ts` define the same schema. Changes must be made in both places. Drizzle config and migrations live under `packages/api/`.
- **Job chaining**: each worker job triggers the next via `boss.send()` when it produces results. The fetch job triggers summarize, summarize triggers edition-build.
- **Article deduplication**: `sourceUrl` has a unique constraint; inserts use `onConflictDoNothing`.
- **Claude summarization**: uses `claude-haiku-4-5-20251001`, prompts in Norwegian, rate-limited at 1s between calls (configurable via `SUMMARIZE_RATE_LIMIT_MS`).

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `ANTHROPIC_API_KEY`. The worker needs both; the API only needs `DATABASE_URL`.

## Code Style

- Prettier: double quotes, semicolons, trailing commas, 100 char width
- ESLint: TypeScript recommended rules, enforced type-only imports (`verbatimModuleSyntax`)
- Unused variables must be prefixed with `_`
