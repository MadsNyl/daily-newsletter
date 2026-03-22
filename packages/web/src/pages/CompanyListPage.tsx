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
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12 lg:max-w-5xl lg:px-8 xl:max-w-6xl">
          {/* Header */}
          <header className="mb-6 animate-fade-in sm:mb-10">
            <div className="flex items-center gap-3 sm:justify-center md:justify-between">
              <NavigationDrawer />
              <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-5xl sm:text-center md:text-left md:text-4xl">
                Aksjer
              </h1>
              <div className="hidden md:block" />
            </div>
          </header>

          <div className="mx-auto max-w-2xl lg:max-w-none">
            {/* Search */}
            <div className="relative mb-6 lg:max-w-md">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
              />
              <input
                type="text"
                placeholder="Søk etter selskap..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border-light bg-surface-raised py-2.5 pl-10 pr-4 text-base text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* List */}
            {loading ? (
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
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
              <div className="space-y-1 lg:grid lg:grid-cols-2 lg:gap-1 lg:space-y-0 xl:grid-cols-3">
                {filtered.map((c) => (
                  <button
                    key={c.ticker}
                    onClick={() => navigate(`/companies/${c.ticker}`)}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface-raised active:bg-border-light"
                  >
                    <div>
                      <div className="font-semibold text-ink">{c.ticker}</div>
                      <div className="text-xs text-ink-tertiary">{c.name}</div>
                    </div>
                    <ChevronRight size={16} className="text-ink-tertiary" />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-ink-tertiary lg:col-span-full">
                    Ingen selskaper funnet
                  </p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
