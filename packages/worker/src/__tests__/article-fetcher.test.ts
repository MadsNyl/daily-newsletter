import { describe, it, expect } from "vitest";
import { parseTickers } from "../article-fetcher.js";

describe("parseTickers", () => {
  it("extracts tickers from companies array", () => {
    const item = {
      companies: {
        company: ["EQNR.OSE", "STL.OSE"],
      },
    };
    expect(parseTickers(item)).toEqual(["EQNR.OSE", "STL.OSE"]);
  });

  it("handles single company (not array)", () => {
    const item = {
      companies: {
        company: "EQNR.OSE",
      },
    };
    expect(parseTickers(item)).toEqual(["EQNR.OSE"]);
  });

  it("returns empty array when no companies tag", () => {
    const item = {};
    expect(parseTickers(item)).toEqual([]);
  });

  it("returns empty array when companies is empty", () => {
    const item = { companies: {} };
    expect(parseTickers(item)).toEqual([]);
  });
});
