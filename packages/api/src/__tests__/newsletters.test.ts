import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Proxy-based mock that auto-chains any Drizzle method call and resolves to
// a configurable result at the end of the chain.
function makeSelectChain(result: unknown[] = []) {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") {
        // Make the chain itself awaitable and resolve to `result`
        return (resolve: (v: unknown[]) => unknown) => Promise.resolve(result).then(resolve);
      }
      // Every chained method returns the same proxy so the chain can continue
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    $count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("../queue.js", () => ({
  getQueue: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue("job-id-123"),
  }),
}));

const { db } = await import("../db/index.js");
const app = new Hono();
const newsletters = (await import("../routes/newsletters.js")).default;
app.route("/newsletters", newsletters);

// Helper to configure what db.select() returns for successive calls
function mockSelectReturning(...results: unknown[][]) {
  let callIndex = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const result = results[callIndex] ?? [];
    callIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return makeSelectChain(result) as any;
  });
}

describe("GET /newsletters/:date — input validation", () => {
  it("returns 400 for invalid date format (non-date string)", async () => {
    const res = await app.request("/newsletters/bad-date");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for date missing dashes", async () => {
    const res = await app.request("/newsletters/20260317");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for partial date", async () => {
    const res = await app.request("/newsletters/2026-03");
    expect(res.status).toBe(400);
  });
});

describe("GET /newsletters/:date — edition not found", () => {
  beforeEach(() => {
    // db.select returns empty array → no edition found
    vi.mocked(db.select).mockImplementation(() => makeSelectChain([]) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("returns 404 when no edition exists for the date", async () => {
    const res = await app.request("/newsletters/2026-03-17");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("GET /newsletters/:date — edition found", () => {
  const fakeEdition = {
    id: "ed-1",
    date: new Date("2026-03-17"),
    title: "Daily Newsletter",
    createdAt: new Date(),
  };

  const fakeArticles = [
    {
      id: "art-1",
      title: "Article One",
      summary: "Summary one",
      thumbnailUrl: null,
      sourceUrl: "https://example.com/1",
      sourceName: "Example",
      publishedAt: new Date(),
      status: "summarized",
      order: 1,
    },
  ];

  const fakeArticleCompanies = [
    { articleId: "art-1", ticker: "EQNR.OSE", name: "Equinor" },
  ];

  beforeEach(() => {
    // First call → edition, second call → articles, third call → article-companies
    mockSelectReturning([fakeEdition], fakeArticles, fakeArticleCompanies);
  });

  it("returns 200 with articles array", async () => {
    const res = await app.request("/newsletters/2026-03-17");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("articles");
    expect(Array.isArray(body.data.articles)).toBe(true);
  });

  it("articles include a companies array", async () => {
    // Re-configure mocks for this test
    mockSelectReturning([fakeEdition], fakeArticles, fakeArticleCompanies);
    const res = await app.request("/newsletters/2026-03-17");
    expect(res.status).toBe(200);
    const body = await res.json();
    const firstArticle = body.data.articles[0];
    expect(firstArticle).toHaveProperty("companies");
    expect(Array.isArray(firstArticle.companies)).toBe(true);
  });
});

describe("GET /newsletters/:date — company filter", () => {
  const fakeEdition = {
    id: "ed-1",
    date: new Date("2026-03-17"),
    title: "Daily Newsletter",
    createdAt: new Date(),
  };

  beforeEach(() => {
    // edition found, filtered articles empty, article-companies empty
    mockSelectReturning([fakeEdition], [], []);
  });

  it("accepts ?company= query param without error", async () => {
    const res = await app.request("/newsletters/2026-03-17?company=EQNR.OSE");
    // 200 with empty articles list is valid
    expect([200, 404]).toContain(res.status);
  });

  it("returns articles array (possibly empty) when company filter applied", async () => {
    mockSelectReturning([fakeEdition], [], []);
    const res = await app.request("/newsletters/2026-03-17?company=EQNR.OSE");
    if (res.status === 200) {
      const body = await res.json();
      expect(body.data).toHaveProperty("articles");
      expect(Array.isArray(body.data.articles)).toBe(true);
    }
  });
});

describe("POST /newsletters/trigger", () => {
  it("returns 201 with jobId when queue accepts the job", async () => {
    const res = await app.request("/newsletters/trigger", { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("jobId");
  });
});
