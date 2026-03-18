import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fetchCompanies } from "../api/client";
import type { Company } from "../api/client";
import NavigationDrawer from "../components/NavigationDrawer";
import { Search, ChevronRight } from "lucide-react";

export default function CompanyListPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? companies.filter(
        (c) =>
          c.ticker.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : companies;

  return (
    <>
      <div className="border-b-2 border-accent" />

      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
          {/* Header */}
          <header className="mb-6 animate-fade-in sm:mb-10">
            <div className="flex items-center gap-3 sm:justify-center">
              <NavigationDrawer />
              <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-5xl sm:text-center">
                Aksjer
              </h1>
            </div>
          </header>

          <div className="mx-auto max-w-2xl">
        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            type="text"
            placeholder="Søk etter selskap..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-light bg-surface-raised py-2.5 pl-9 pr-4 text-base text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-border-light bg-surface-raised p-4"
              >
                <div className="h-4 w-16 rounded bg-border-light mb-1.5" />
                <div className="h-3 w-32 rounded bg-border-light" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((c) => (
              <button
                key={c.ticker}
                onClick={() => navigate(`/companies/${c.ticker}`)}
                className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface-raised"
              >
                <div>
                  <div className="font-semibold text-ink">{c.ticker}</div>
                  <div className="text-xs text-ink-tertiary">{c.name}</div>
                </div>
                <ChevronRight size={16} className="text-ink-tertiary" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-tertiary">Ingen selskaper funnet</p>
            )}
          </div>
        )}
          </div>
        </main>
      </div>
    </>
  );
}
