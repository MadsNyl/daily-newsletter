import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
}));

const app = new Hono();
const companies = (await import("../routes/companies.js")).default;
app.route("/companies", companies);

describe("GET /companies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when date param is missing", async () => {
    const res = await app.request("/companies");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/companies?date=not-a-date");
    expect(res.status).toBe(400);
  });
});
