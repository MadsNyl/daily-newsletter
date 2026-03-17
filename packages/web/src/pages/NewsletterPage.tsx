import { useEffect, useReducer, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import type { NewsletterEdition, Company } from "../api/client";
import { fetchEdition, fetchCompanies } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import DateDrawer from "../components/DateDrawer";
import CompanyDrawer from "../components/CompanyDrawer";

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
          <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-5xl">
            Daglig Nyhetsbrev
          </h1>
          <p className="mt-1 text-sm text-ink-tertiary sm:mt-2">
            Norske nyheter for finansprofesjonelle, oppsummert daglig.
          </p>
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
