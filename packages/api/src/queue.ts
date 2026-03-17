import PgBoss from "pg-boss";
import { config } from "./config.js";

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(config.databaseUrl);
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
