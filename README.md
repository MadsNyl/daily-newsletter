# Daily Newsletter

A system that fetches Norwegian news articles, summarizes them using Claude, and serves a daily newsletter via a web frontend.

## Architecture

- **`packages/api`** — Hono REST API serving newsletter data
- **`packages/worker`** — pg-boss workers for fetching and summarizing articles
- **`packages/web`** — React + Vite frontend

All services share a single PostgreSQL instance. Job queuing is handled by pg-boss (Postgres-backed).

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for PostgreSQL)

## Setup

```bash
# Clone and install
pnpm install

# Copy environment variables
cp .env.example .env

# Start PostgreSQL
docker compose up -d

# Push database schema
pnpm db:push

# Start all services
pnpm dev
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all services in parallel |
| `pnpm build` | Build all packages |
| `pnpm check` | Lint + typecheck |
| `pnpm db:push` | Push schema to database |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Drizzle Studio |
