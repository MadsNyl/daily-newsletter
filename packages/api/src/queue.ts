import PgBoss from "pg-boss";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter";

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(connectionString);
    boss.on("error", (error) => console.error("pg-boss error:", error));
    await boss.start();
  }
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}
