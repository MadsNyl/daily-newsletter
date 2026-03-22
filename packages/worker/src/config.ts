export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter",
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  fetchCron: process.env.FETCH_CRON ?? "0 6,12,18 * * *",
  summarizeRateLimitMs: Number(process.env.SUMMARIZE_RATE_LIMIT_MS ?? "1000"),
  port: Number(process.env.PORT ?? "3000"),
};
