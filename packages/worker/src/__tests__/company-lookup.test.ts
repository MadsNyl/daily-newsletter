import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the module under test
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

const { db } = await import("../db/index.js");
const { extractCompanyName, resolveCompany } = await import("../company-lookup.js");

describe("company-lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("extractCompanyName", () => {
    it("extracts name from JSON-LD Corporation schema", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBe("EQUINOR");
    });

    it("extracts name when JSON-LD is embedded in larger object", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Corporation","name":"STOREBRAND","tickerSymbol":"STB","url":"https://e24.no"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBe("STOREBRAND");
    });

    it("returns null when no Corporation schema found", () => {
      const html = `<html><head></head><body>No schema here</body></html>`;
      expect(extractCompanyName(html)).toBeNull();
    });

    it("returns null when JSON-LD has no name field", () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        {"@type":"Corporation","tickerSymbol":"EQNR"}
        </script>
        </head><body></body></html>
      `;
      expect(extractCompanyName(html)).toBeNull();
    });
  });

  describe("resolveCompany", () => {
    it("returns existing company from DB without fetching", async () => {
      const mockCompany = { id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" };
      const fromChain = { where: vi.fn().mockResolvedValue([mockCompany]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("fetches from E24 and inserts when ticker not in DB", async () => {
      const fromChain = { where: vi.fn().mockResolvedValue([]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      const html = `<script type="application/ld+json">{"@type":"Corporation","name":"EQUINOR","tickerSymbol":"EQNR"}</script>`;
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      });

      const inserted = [{ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" }];
      const returningChain = { returning: vi.fn().mockResolvedValue(inserted) };
      const conflictChain = { onConflictDoNothing: vi.fn().mockReturnValue(returningChain) };
      const valuesChain = { values: vi.fn().mockReturnValue(conflictChain) };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(valuesChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQUINOR" });
      expect(fetch).toHaveBeenCalledWith(
        "https://e24.no/bors/instrument/EQNR.OSE",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("falls back to ticker as name when fetch fails", async () => {
      const fromChain = { where: vi.fn().mockResolvedValue([]) };
      const selectChain = { from: vi.fn().mockReturnValue(fromChain) };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const inserted = [{ id: "uuid-1", ticker: "EQNR.OSE", name: "EQNR.OSE" }];
      const returningChain = { returning: vi.fn().mockResolvedValue(inserted) };
      const conflictChain = { onConflictDoNothing: vi.fn().mockReturnValue(returningChain) };
      const valuesChain = { values: vi.fn().mockReturnValue(conflictChain) };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(valuesChain);

      const result = await resolveCompany("EQNR.OSE");

      expect(result).toEqual({ id: "uuid-1", ticker: "EQNR.OSE", name: "EQNR.OSE" });
    });
  });
});
