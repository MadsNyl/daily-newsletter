import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import newsletters from "./routes/newsletters.js";
import articles from "./routes/articles.js";
import { stopQueue } from "./queue.js";

const app = new Hono();

app.use("/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/newsletters", newsletters);
app.route("/api/articles", articles);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

const port = Number(process.env.PORT) || 3000;

console.log(`API server starting on port ${port}`);

const server = serve({ fetch: app.fetch, port });

const shutdown = async () => {
  console.log("Shutting down API server...");
  await stopQueue();
  server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
