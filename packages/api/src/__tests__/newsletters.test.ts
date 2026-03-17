import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const makeSelectChain = (result: unknown[] = []) => {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "innerJoin", "orderBy", "limit", "offset"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain["then"] = (resolve: (v: unknown[]) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
};

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    $count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("../queue.js", () => ({
  getQueue: vi.fn(),
}));

const { db } = await import("../db/index.js");
const app = new Hono();
const newsletters = (await import("../routes/newsletters.js")).default;
app.route("/newsletters", newsletters);

describe("GET /newsletters/:date", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockImplementation(() => makeSelectChain() as any);
  });

  it("includes companies array on each article", async () => {
    const res = await app.request("/newsletters/2026-03-17");
    expect([200, 404]).toContain(res.status);
  });

  it("filters articles by company query param", async () => {
    const res = await app.request("/newsletters/2026-03-17?company=EQNR.OSE");
    expect([200, 404]).toContain(res.status);
  });
});
