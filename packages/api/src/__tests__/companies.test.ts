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

describe("GET /companies/:ticker", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(db.selectDistinct).mockImplementation(() => makeSelectChain() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("returns 404 for unknown ticker", async () => {
    vi.mocked(db.select).mockImplementation(() => makeSelectChain([]) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await app.request("/companies/UNKNOWN");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns company with articles", async () => {
    const fakeCompany = { id: "c-1", ticker: "DNB", name: "DNB Bank ASA" };
    const fakeArticles = [
      {
        id: "a-1",
        title: "DNB Q4",
        summary: "Good results",
        sourceUrl: "https://e24.no/1",
        sourceName: "E24",
        thumbnailUrl: null,
        publishedAt: "2026-03-15",
      },
    ];

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const results = [
        [fakeCompany], // company lookup
        fakeArticles, // articles query
        [{ count: 1 }], // count query
      ];
      const result = results[selectCallCount] ?? [];
      selectCallCount++;
      return makeSelectChain(result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    const res = await app.request("/companies/DNB");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("ticker", "DNB");
    expect(body.data).toHaveProperty("articles");
    expect(body).toHaveProperty("pagination");
  });

  it("respects limit param", async () => {
    const fakeCompany = { id: "c-1", ticker: "DNB", name: "DNB Bank ASA" };

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const results = [[fakeCompany], [], [{ count: 0 }]];
      const result = results[selectCallCount] ?? [];
      selectCallCount++;
      return makeSelectChain(result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    const res = await app.request("/companies/DNB?limit=5");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(5);
  });
});
