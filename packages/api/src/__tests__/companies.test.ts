import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Proxy-based mock that auto-chains any Drizzle method call and resolves to
// a configurable result at the end of the chain.
function makeSelectChain(result: unknown[] = []) {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") {
        return (resolve: (v: unknown[]) => unknown) => Promise.resolve(result).then(resolve);
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    selectDistinct: vi.fn(() => makeSelectChain()),
  },
}));

const { db } = await import("../db/index.js");
const app = new Hono();
const companies = (await import("../routes/companies.js")).default;
app.route("/companies", companies);

describe("GET /companies", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(db.selectDistinct).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("returns all active companies when date param is missing", async () => {
    const fakeCompanies = [
      { ticker: "DNB", name: "DNB Bank ASA" },
      { ticker: "EQNR", name: "Equinor ASA" },
    ];
    vi.mocked(db.select).mockImplementation(() => makeSelectChain(fakeCompanies) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await app.request("/companies");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/companies?date=not-a-date");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns empty array when no edition found for the date", async () => {
    // db.select returns [] → no edition found → route returns { data: [] }
    vi.mocked(db.select).mockImplementation(() => makeSelectChain([]) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await app.request("/companies?date=2026-03-17");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body.data).toEqual([]);
  });

  it("returns companies list when edition exists", async () => {
    const fakeEdition = { id: "ed-1", date: new Date("2026-03-17") };
    const fakeCompanies = [
      { ticker: "EQNR.OSE", name: "Equinor" },
      { ticker: "DNB.OSE", name: "DNB Bank" },
    ];

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const result = selectCallCount === 0 ? [fakeEdition] : [];
      selectCallCount++;
      return makeSelectChain(result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    vi.mocked(db.selectDistinct).mockImplementation(
      () => makeSelectChain(fakeCompanies) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const res = await app.request("/companies?date=2026-03-17");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
});
