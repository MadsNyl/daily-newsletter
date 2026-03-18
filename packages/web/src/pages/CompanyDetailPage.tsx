import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { fetchCompanyDetail, fetchCompanyQuote } from "../api/client";
import type { CompanyDetail, CompanyQuote, CompanyArticle } from "../api/client";
import PriceChart from "../components/PriceChart";
import { ArrowLeft } from "lucide-react";

function formatNumber(n: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)} brd`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function sourceColor(source: string): string {
  if (source === "E24") return "text-source-e24";
  if (source === "Økonomi24") return "text-source-okonomi24";
  return "text-ink-tertiary";
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border-light ${className ?? ""}`} />;
}

export default function CompanyDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [quote, setQuote] = useState<CompanyQuote | null>(null);
  const [articles, setArticles] = useState<CompanyArticle[]>([]);
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, total: 0 });
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!ticker) return;

    setLoadingDetail(true);
    setLoadingQuote(true);

    fetchCompanyDetail(ticker)
      .then((res) => {
        setDetail(res.data);
        setArticles(res.data.articles);
        setPagination(res.pagination);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));

    fetchCompanyQuote(ticker)
      .then(setQuote)
      .catch(() => {})
      .finally(() => setLoadingQuote(false));
  }, [ticker]);

  const loadMore = async () => {
    if (!ticker || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextOffset = pagination.offset + pagination.limit;
      const res = await fetchCompanyDetail(ticker, pagination.limit, nextOffset);
      setArticles((prev) => [...prev, ...res.data.articles]);
      setPagination(res.pagination);
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = pagination.offset + pagination.limit < pagination.total;
  const isPositive = (quote?.changeIntraDay ?? 0) >= 0;

  return (
    <>
      <div className="border-b-2 border-accent" />
      <div className="min-h-screen bg-surface">
      {/* Topplinje */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/companies")}
            className="p-2 -ml-2 text-ink-secondary hover:text-ink transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">{ticker}</h1>
            {detail && <p className="text-xs text-ink-tertiary">{detail.name}</p>}
            {!detail && loadingDetail && <Skeleton className="mt-1 h-3 w-24" />}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl">
        {/* Pris */}
        <div className="border-b border-border-light px-4 py-4">
          {loadingQuote ? (
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-ink">
                  {quote.price?.toFixed(2) ?? "–"}
                </span>
                <span className="text-sm text-ink-tertiary">{quote.currency}</span>
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isPositive ? "bg-accent-subtle text-accent" : "bg-red-50 text-red-700"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {quote.changeIntraDay?.toFixed(2) ?? "0"} ({isPositive ? "+" : ""}
                  {quote.changePctIntraDay?.toFixed(2) ?? "0"}%)
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* Graf */}
        {ticker && (
          <div className="border-b border-border-light px-4 py-4">
            <PriceChart ticker={ticker} />
          </div>
        )}

        {/* Nøkkeltall */}
        {(loadingQuote || quote) && (
        <div className="border-b border-border-light px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Nøkkeltall</h2>
          {loadingQuote ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border-light bg-surface-raised p-3"
                >
                  <Skeleton className="h-2.5 w-16 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : quote ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Markedsverdi", value: formatNumber(quote.marketCap) },
                { label: "P/E", value: quote.peValue?.toFixed(2) ?? "–" },
                { label: "Volum", value: formatNumber(quote.volume) },
                {
                  label: "Høy / Lav",
                  value: `${quote.high?.toFixed(1) ?? "–"} / ${quote.low?.toFixed(1) ?? "–"}`,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-border-light bg-surface-raised p-3"
                >
                  <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-ink">{m.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        )}

        {/* Analytikere */}
        {(loadingQuote || quote) && (
        <div className="border-b border-border-light px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Analytikere</h2>
          {loadingQuote ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-5 flex-1 rounded" />
                </div>
              ))}
            </div>
          ) : quote ? (
            (() => {
              const a = quote.analysts;
              const total = a.buy + a.overweight + a.hold + a.underweight + a.sell;
              if (total === 0) return <p className="text-sm text-ink-tertiary">Ingen data</p>;
              const bars = [
                { label: "Kjøp", count: a.buy, bg: "bg-green-600", text: "text-white" },
                { label: "Overvekt", count: a.overweight, bg: "bg-green-300", text: "text-green-900" },
                { label: "Hold", count: a.hold, bg: "bg-amber-400", text: "text-amber-900" },
                { label: "Undervekt", count: a.underweight, bg: "bg-red-300", text: "text-red-900" },
                { label: "Selg", count: a.sell, bg: "bg-red-500", text: "text-white" },
              ];
              const max = Math.max(...bars.map((b) => b.count));
              return (
                <div className="space-y-1.5">
                  {bars.map((b) => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] text-ink">{b.label}</span>
                      <div className="flex-1 h-5 rounded bg-border-light overflow-hidden">
                        {b.count > 0 && (
                          <div
                            className={`h-full rounded flex items-center px-1.5 ${b.bg} ${b.text}`}
                            style={{ width: `${Math.max((b.count / max) * 100, 12)}%` }}
                          >
                            <span className="text-[10px] font-semibold">{b.count}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : null}
        </div>
        )}

        {/* Største eiere */}
        {(loadingQuote || (quote && quote.topOwners.length > 0)) && (
        <div className="border-b border-border-light px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Største eiere</h2>
          {loadingQuote ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
              ))}
            </div>
          ) : quote && quote.topOwners.length > 0 ? (
            <div className="space-y-2">
              {quote.topOwners.map((o) => (
                <div key={o.investor} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{o.investor}</span>
                  <span className="font-semibold text-ink-secondary">
                    {o.percentageOfTotal.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        )}

        {/* Relaterte artikler */}
        <div className="px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Relaterte artikler</h2>
          {loadingDetail ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border-light bg-surface-raised p-3"
                >
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-ink-tertiary">Ingen artikler funnet</p>
          ) : (
            <>
              <div className="space-y-2">
                {articles.map((a) => (
                  <a
                    key={a.id}
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border-light bg-surface-raised p-3 transition-colors hover:border-border active:bg-border-light"
                  >
                    <div className="text-sm font-semibold text-ink">{a.title}</div>
                    <div className="mt-1 flex gap-2 text-xs">
                      <span className={`font-semibold ${sourceColor(a.sourceName)}`}>
                        {a.sourceName}
                      </span>
                      <span className="text-ink-tertiary">{formatDate(a.publishedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-raised disabled:opacity-50"
                >
                  {loadingMore ? "Laster..." : "Last flere artikler"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
