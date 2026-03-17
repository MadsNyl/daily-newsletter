import { useEffect, useReducer } from "react";
import { useParams, useNavigate } from "react-router";
import type { NewsletterEdition } from "../api/client";
import { fetchEdition } from "../api/client";
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

  const today = formatDateParam(new Date());
  const currentDate = date ?? today;

  const [state, dispatch] = useReducer(reducer, { edition: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch" });

    fetchEdition(currentDate)
      .then((data) => {
        if (!cancelled) dispatch({ type: "success", edition: data });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "error", message: err.message });
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
          Ingen utgave funnet for {toLocalDate(currentDate).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}.
        </div>
      )}

      {!state.loading && !state.error && state.edition && (
        <div className="flex flex-col gap-4">
          {state.edition.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </main>
  );
}
