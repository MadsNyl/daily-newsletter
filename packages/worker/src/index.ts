import PgBoss from "pg-boss";
import { fetchArticles } from "./article-fetcher.js";
import { summarizePendingArticles } from "./article-summarizer.js";
import { buildEdition } from "./edition-builder.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter";

const FETCH_CRON = process.env.FETCH_CRON ?? "0 6,12,18 * * *";
const FETCH_JOB = "article-fetch";
const SUMMARIZE_JOB = "article-summarize";
const BUILD_EDITION_JOB = "edition-build";

async function main() {
  const boss = new PgBoss(connectionString);

  boss.on("error", (error) => console.error("pg-boss error:", error));

  await boss.start();
  console.log("Worker started");

  await boss.work(FETCH_JOB, async () => {
    console.log("Starting article fetch...");
    const result = await fetchArticles();
    console.log(`Article fetch complete: ${result.inserted} inserted, ${result.skipped} skipped`);

    if (result.inserted > 0) {
      await boss.send(SUMMARIZE_JOB, {});
      console.log("Queued article-summarize job");
    }
  });

  await boss.work(SUMMARIZE_JOB, async () => {
    console.log("Starting article summarization...");
    const result = await summarizePendingArticles();
    console.log(
      `Summarization complete: ${result.summarized} summarized, ${result.failed} failed`,
    );

    if (result.summarized > 0) {
      await boss.send(BUILD_EDITION_JOB, {});
      console.log("Queued edition-build job");
    }
  });

  await boss.work(BUILD_EDITION_JOB, async () => {
    console.log("Starting edition build...");
    const result = await buildEdition();
    console.log(`Edition build complete: ${result.date}, ${result.articleCount} articles`);
  });

  await boss.schedule(FETCH_JOB, FETCH_CRON, { retryLimit: 3, retryDelay: 60 });
  console.log(`Scheduled ${FETCH_JOB} with cron: ${FETCH_CRON}`);

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
