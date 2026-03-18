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
