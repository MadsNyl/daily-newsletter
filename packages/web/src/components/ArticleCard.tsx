import { useState } from "react";
import type { Article } from "../api/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const SOURCE_COLORS: Record<string, { text: string; bg: string }> = {
  E24: { text: "text-[var(--color-source-e24)]", bg: "bg-[var(--color-source-e24-bg)]" },
  "Økonomi24": { text: "text-[var(--color-source-okonomi24)]", bg: "bg-[var(--color-source-okonomi24-bg)]" },
};

interface ArticleCardProps {
  article: Article;
  index: number;
  onCompanyClick?: (ticker: string) => void;
}

export default function ArticleCard({ article, index, onCompanyClick }: ArticleCardProps) {
  const [open, setOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const sourceColor = SOURCE_COLORS[article.sourceName];

  return (
    <>
      <article
        className="group flex cursor-pointer gap-5 border-b border-border-light py-6 animate-slide-up active:bg-surface-raised/50 sm:cursor-default sm:py-5 sm:active:bg-transparent"
        style={{ animationDelay: `${index * 60}ms` }}
        onClick={(e) => {
          // On mobile, open the drawer. On desktop, do nothing (let the link handle it).
          if (window.innerWidth < 640) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {article.thumbnailUrl && (
          <img
            src={article.thumbnailUrl}
            alt=""
            loading="lazy"
            className="hidden h-24 w-32 shrink-0 rounded object-cover transition-opacity group-hover:opacity-90 sm:block"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-serif text-xl leading-snug text-ink transition-colors group-hover:text-accent">
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {article.title}
            </a>
            <span className="sm:hidden">{article.title}</span>
          </h2>
          {article.summary && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-secondary sm:line-clamp-none">
              {article.summary}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${sourceColor ? `${sourceColor.bg} ${sourceColor.text}` : "bg-surface-raised text-ink-tertiary"}`}>
              {article.sourceName}
            </span>
            {article.publishedAt && (
              <>
                <span aria-hidden="true" className="text-border">&middot;</span>
                <time className="text-xs text-ink-tertiary">
                  {new Date(article.publishedAt).toLocaleDateString("nb-NO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              </>
            )}
            {article.companies.length > 0 && (
              <>
                <span aria-hidden="true" className="text-border">&middot;</span>
                {article.companies.map((c) => (
                  <span key={c.ticker} className="hidden items-center gap-1 sm:inline-flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompanyClick?.(c.ticker);
                      }}
                      className="text-xs font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {c.name}
                    </button>
                    <a
                      href={`https://e24.no/bors/instrument/${c.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${c.name} på E24 Børs`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink-tertiary transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:rounded-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                        <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                        <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                      </svg>
                    </a>
                  </span>
                ))}
                <span className="text-xs font-medium text-accent sm:hidden">
                  {article.companies.map((c) => c.name).join(", ")}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Mobile chevron hint */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-1 h-4 w-4 shrink-0 text-ink-tertiary sm:hidden"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </article>

      {/* Article detail drawer (mobile) */}
      <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) setImageLoaded(false); }}>
        <DrawerContent className="h-[85dvh] border-t-0">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{article.title}</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto px-5 pb-6 pt-4">
            {article.thumbnailUrl && (
              <div className="relative mb-4 w-full overflow-hidden rounded-lg" style={{ maxHeight: "200px" }}>
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-surface-raised" />
                )}
                <img
                  src={article.thumbnailUrl}
                  alt=""
                  className={`w-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  style={{ maxHeight: "200px" }}
                  onLoad={() => setImageLoaded(true)}
                />
              </div>
            )}

            <h2 className="font-serif text-2xl leading-snug text-ink">{article.title}</h2>

            <div className="mt-2 flex items-center gap-2 text-xs text-ink-tertiary">
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-semibold ${sourceColor ? `${sourceColor.bg} ${sourceColor.text}` : "bg-surface-raised text-ink-tertiary"}`}>
                {article.sourceName}
              </span>
              {article.publishedAt && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <time>
                    {new Date(article.publishedAt).toLocaleDateString("nb-NO", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                </>
              )}
            </div>

            {article.summary && (
              <p className="mt-4 text-sm leading-relaxed text-ink-secondary">{article.summary}</p>
            )}

            {article.companies.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {article.companies.map((c) => (
                  <button
                    key={c.ticker}
                    type="button"
                    onClick={() => {
                      onCompanyClick?.(c.ticker);
                      setOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1.5 text-xs font-medium text-accent transition-colors active:bg-accent-light"
                  >
                    {c.name}
                    <span className="text-accent/50">{c.ticker}</span>
                  </button>
                ))}
              </div>
            )}

            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors active:bg-accent-hover"
            >
              Les hele artikkelen
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.03-.8a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 1 1 1.06 1.06L12.56 4.44h1.69a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 1.5 0v1.69l3.22-3.22Z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
