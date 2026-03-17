import { useEffect, useReducer, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import type { NewsletterEdition, Company } from "../api/client";
import { fetchEdition, fetchCompanies } from "../api/client";
import ArticleCard from "../components/ArticleCard";

function formatDateParam(date: Date): string {
  return date.toISOString().split("T")[0];
}

function toLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type State = {
  edition: NewsletterEdition | null;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: "fetch" }
  | { type: "success"; edition: NewsletterEdition | null }
  | { type: "error"; message: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "fetch":
      return { edition: null, loading: true, error: null };
    case "success":
      return { edition: action.edition, loading: false, error: null };
    case "error":
      return { edition: null, loading: false, error: action.message };
  }
}

export default function NewsletterPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = formatDateParam(new Date());
  const currentDate = date ?? today;
  const companyFilter = searchParams.get("company") ?? undefined;

  const [state, dispatch] = useReducer(reducer, { edition: null, loading: true, error: null });
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch" });

    fetchEdition(currentDate, companyFilter)
      .then((data) => {
        if (!cancelled) dispatch({ type: "success", edition: data });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [currentDate, companyFilter]);

  useEffect(() => {
    let cancelled = false;

    fetchCompanies(currentDate)
      .then((data) => {
        if (!cancelled) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  function navigateDate(offset: number) {
    const d = toLocalDate(currentDate);
    d.setDate(d.getDate() + offset);
    navigate(`/${formatDateParam(d)}`);
  }

  function setCompanyFilter(ticker: string | undefined) {
    if (ticker) {
      setSearchParams({ company: ticker });
    } else {
      setSearchParams({});
    }
  }

  const isToday = currentDate === today;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Daglig Nyhetsbrev</h1>
        <p className="mt-1 text-gray-500">Norske nyheter, oppsummert daglig.</p>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          &larr; Forrige
        </button>

        <input
          type="date"
          value={currentDate}
          max={today}
          onChange={(e) => navigate(`/${e.target.value}`)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        />

        <button
          onClick={() => navigateDate(1)}
          disabled={isToday}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Neste &rarr;
        </button>
      </div>

      {companies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Selskaper:</span>
          {companies.map((c) => (
            <button
              key={c.ticker}
              onClick={() =>
                setCompanyFilter(companyFilter === c.ticker ? undefined : c.ticker)
              }
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                companyFilter === c.ticker
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {c.name}
              {companyFilter === c.ticker && " \u00d7"}
            </button>
          ))}
        </div>
      )}

      {state.loading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Kunne ikke laste nyhetsbrevet. Prøv igjen senere.
        </div>
      )}

      {!state.loading && !state.error && !state.edition && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          Ingen utgave funnet for{" "}
          {toLocalDate(currentDate).toLocaleDateString("nb-NO", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </div>
      )}

      {!state.loading && !state.error && state.edition && (
        <div className="flex flex-col gap-4">
          {state.edition.articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onCompanyClick={setCompanyFilter}
            />
          ))}
          {state.edition.articles.length === 0 && companyFilter && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
              Ingen artikler funnet for dette selskapet.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
