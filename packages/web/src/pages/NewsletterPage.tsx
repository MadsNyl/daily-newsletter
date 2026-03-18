import { useEffect, useReducer, useRef, useState, lazy, Suspense } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import type { NewsletterEdition, Company } from "../api/client";
import { fetchEdition, fetchCompanies } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import DateDrawer from "../components/DateDrawer";
import CompanyDrawer from "../components/CompanyDrawer";
import SummaryDrawer from "../components/SummaryDrawer";
import NavigationDrawer from "../components/NavigationDrawer";

const Markdown = lazy(() => import("react-markdown"));

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(dateString: string): string {
  return toLocalDate(dateString).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDisplayDate(dateString: string): string {
  return toLocalDate(dateString).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });
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

function DesktopSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-6 hidden animate-fade-in sm:block">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-raised px-5 py-3.5 text-left transition-all hover:border-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-center gap-2.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-accent"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-ink">Dagens oppsummering</span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-ink-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {expanded && (
        <div className="mt-3 rounded-lg border border-border-light bg-white px-6 py-5 animate-fade-in">
          <div className="prose prose-sm max-w-none text-ink-secondary prose-headings:font-serif prose-headings:text-ink prose-strong:text-ink prose-p:leading-relaxed">
            <Suspense fallback={<p className="text-sm text-ink-tertiary">Laster…</p>}>
              <Markdown>{summary}</Markdown>
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
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
  const dateRef = useRef<HTMLInputElement>(null);

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
    const target = formatDateParam(d);
    if (target <= today) navigate(`/${target}`);
  }

  function handleDateChange(dateStr: string) {
    navigate(`/${dateStr}`);
  }

  function setCompanyFilter(ticker: string | undefined) {
    if (ticker) {
      setSearchParams({ company: ticker });
    } else {
      setSearchParams({});
    }
  }

  const isToday = currentDate === today;
  const articleCount = state.edition?.articles.length ?? 0;

  return (
    <>
      <a
        href="#innhold"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
      >
        Hopp til innhold
      </a>

      <div className="border-b-2 border-accent" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="mb-6 animate-fade-in sm:mb-10">
          <div className="flex items-center gap-3 sm:justify-center">
            <div className="sm:hidden">
              <NavigationDrawer />
            </div>
            <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-5xl sm:text-center">
              Daglig Nyhetsbrev
            </h1>
          </div>
        </header>

        {/* Mobile: Date drawer + Company drawer */}
        <div className="mb-5 flex flex-col gap-3 sm:hidden animate-fade-in">
          <DateDrawer
            currentDate={currentDate}
            maxDate={today}
            displayDate={formatShortDisplayDate(currentDate)}
            onDateChange={handleDateChange}
            onNavigate={navigateDate}
            isToday={isToday}
          />
          <CompanyDrawer
            companies={companies}
            activeFilter={companyFilter}
            onFilterChange={setCompanyFilter}
          />
          {state.edition?.summary && <SummaryDrawer summary={state.edition.summary} />}
        </div>

        {/* Desktop: Inline date navigation */}
        <nav
          aria-label="Datonavigasjon"
          className="mb-8 hidden items-center justify-between border-b border-border-light pb-6 animate-fade-in sm:flex"
        >
          <button
            type="button"
            onClick={() => navigateDate(-1)}
            className="text-sm font-medium text-ink-secondary transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            &larr; Forrige dag
          </button>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => dateRef.current?.showPicker()}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <time className="font-serif text-lg capitalize text-ink sm:text-xl">
                {formatDisplayDate(currentDate)}
              </time>
              <p className="mt-0.5 text-xs text-ink-tertiary transition-colors hover:text-accent">
                Velg annen dato
              </p>
            </button>
            <input
              ref={dateRef}
              type="date"
              value={currentDate}
              max={today}
              aria-label="Velg dato"
              onChange={(e) => {
                if (e.target.value) navigate(`/${e.target.value}`);
              }}
              className="sr-only"
            />
          </div>

          <button
            type="button"
            onClick={() => navigateDate(1)}
            disabled={isToday}
            className="text-sm font-medium text-ink-secondary transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            Neste dag &rarr;
          </button>
        </nav>

        {/* Desktop: Company filter chips */}
        {companies.length > 0 && (
          <div
            role="group"
            aria-label="Filtrer etter selskap"
            className="mb-6 hidden flex-wrap items-center gap-2 animate-fade-in sm:flex"
          >
            <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Selskaper
            </span>
            {companies.map((c) => (
              <button
                key={c.ticker}
                onClick={() =>
                  setCompanyFilter(companyFilter === c.ticker ? undefined : c.ticker)
                }
                aria-pressed={companyFilter === c.ticker}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  companyFilter === c.ticker
                    ? "bg-accent text-white"
                    : "bg-surface-raised text-ink-secondary ring-1 ring-border-light hover:ring-accent/40 hover:text-accent"
                }`}
              >
                {c.name}
                {companyFilter === c.ticker && " \u00d7"}
              </button>
            ))}
          </div>
        )}

        {/* Desktop: Daily summary */}
        {state.edition?.summary && (
          <DesktopSummary summary={state.edition.summary} />
        )}

        {/* Articles */}
        <section id="innhold" aria-label="Artikler" aria-live="polite">
          {state.loading && (
            <div className="flex flex-col items-center gap-3 py-20" role="status">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
              <span className="text-xs text-ink-tertiary">Laster artikler…</span>
            </div>
          )}

          {state.error && (
            <div
              role="alert"
              className="animate-fade-in rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
            >
              Kunne ikke laste nyhetsbrevet. Prøv igjen senere.
            </div>
          )}

          {!state.loading && !state.error && !state.edition && (
            <div className="animate-fade-in py-16 text-center">
              <p className="font-serif text-xl text-ink-secondary">Ingen utgave</p>
              <p className="mt-2 text-sm text-ink-tertiary">
                Det finnes ingen utgave for {formatDisplayDate(currentDate)}.
              </p>
            </div>
          )}

          {!state.loading && !state.error && state.edition && (
            <>
              {articleCount > 0 && (
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-ink-tertiary animate-fade-in">
                  {articleCount} {articleCount === 1 ? "artikkel" : "artikler"}
                  {companyFilter &&
                    ` om ${companies.find((c) => c.ticker === companyFilter)?.name ?? companyFilter}`}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {state.edition.articles.map((article, i) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    index={i}
                    onCompanyClick={setCompanyFilter}
                  />
                ))}
              </div>
              {articleCount === 0 && companyFilter && (
                <div className="animate-fade-in py-16 text-center">
                  <p className="font-serif text-xl text-ink-secondary">Ingen treff</p>
                  <p className="mt-2 text-sm text-ink-tertiary">
                    Ingen artikler funnet for dette selskapet.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
