import PgBoss from "pg-boss";
import { fetchArticles } from "./article-fetcher.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter";

const FETCH_CRON = process.env.FETCH_CRON ?? "0 6,12,18 * * *";
const JOB_NAME = "article-fetch";

async function main() {
  const boss = new PgBoss(connectionString);

  boss.on("error", (error) => console.error("pg-boss error:", error));

  await boss.start();
  console.log("Worker started");

  await boss.work(JOB_NAME, async () => {
    console.log("Starting article fetch...");
    const result = await fetchArticles();
    console.log(`Article fetch complete: ${result.inserted} inserted, ${result.skipped} skipped`);
  });

  await boss.schedule(JOB_NAME, FETCH_CRON, { retryLimit: 3, retryDelay: 60 });
  console.log(`Scheduled ${JOB_NAME} with cron: ${FETCH_CRON}`);

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
