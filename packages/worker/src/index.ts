import { config } from "./config.js";
import PgBoss from "pg-boss";
import { fetchArticles } from "./article-fetcher.js";
import { summarizePendingArticles } from "./article-summarizer.js";
import { buildEdition } from "./edition-builder.js";
import { summarizeEdition } from "./edition-summarizer.js";
import { syncTickers } from "./ticker-sync.js";
const FETCH_JOB = "article-fetch";
const SUMMARIZE_JOB = "article-summarize";
const BUILD_EDITION_JOB = "edition-build";
const SUMMARIZE_EDITION_JOB = "edition-summarize";
const TICKER_SYNC_JOB = "ticker-sync";

async function main() {
  const boss = new PgBoss(config.databaseUrl);

  boss.on("error", (error) => console.error("pg-boss error:", error));

  await boss.start();
  console.log("Worker started");

  await boss.createQueue(FETCH_JOB);
  await boss.createQueue(SUMMARIZE_JOB);
  await boss.createQueue(BUILD_EDITION_JOB);
  await boss.createQueue(SUMMARIZE_EDITION_JOB);
  await boss.createQueue(TICKER_SYNC_JOB);

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

    if (result.articleCount > 0) {
      await boss.send(SUMMARIZE_EDITION_JOB, {});
      console.log("Queued edition-summarize job");
    }
  });

  await boss.work(SUMMARIZE_EDITION_JOB, async () => {
    console.log("Starting edition summarize...");
    const result = await summarizeEdition();
    console.log(`Edition summarize complete: ${result.date}, updated: ${result.updated}`);
  });

  await boss.work(TICKER_SYNC_JOB, async () => {
    console.log("Starting ticker sync...");
    const result = await syncTickers();
    console.log(
      `Ticker sync complete: ${result.total} total, ${result.upserted} upserted, ${result.deactivated} deactivated`,
    );
  });

  await boss.schedule(FETCH_JOB, config.fetchCron, { retryLimit: 3, retryDelay: 60 });
  console.log(`Scheduled ${FETCH_JOB} with cron: ${config.fetchCron}`);

  await boss.schedule(TICKER_SYNC_JOB, "0 6 * * *", { retryLimit: 3, retryDelay: 60 });
  console.log(`Scheduled ${TICKER_SYNC_JOB} with cron: 0 6 * * *`);

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
