import PgBoss from "pg-boss";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter";

async function main() {
  const boss = new PgBoss(connectionString);

  boss.on("error", (error) => console.error("pg-boss error:", error));

  await boss.start();
  console.log("Worker started");

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
