import type { Article } from "../api/client";

interface ArticleCardProps {
  article: Article;
  onCompanyClick?: (ticker: string) => void;
}

export default function ArticleCard({ article, onCompanyClick }: ArticleCardProps) {
  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md sm:flex-row"
    >
      {article.thumbnailUrl && (
        <img
          src={article.thumbnailUrl}
          alt=""
          className="h-40 w-full shrink-0 rounded-md object-cover sm:h-28 sm:w-40"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">{article.title}</h2>
        {article.summary && (
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{article.summary}</p>
        )}
        {article.companies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {article.companies.map((c) => (
              <span key={c.ticker} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCompanyClick?.(c.ticker);
                  }}
                  className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {c.name}
                </button>
                <a
                  href={`https://e24.no/bors/instrument/${c.ticker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-gray-400 transition-colors hover:text-blue-600"
                  title={`${c.name} on E24 Bors`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                    <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                  </svg>
                </a>
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-gray-400">
          <span>{article.sourceName}</span>
          {article.publishedAt && (
            <>
              <span>&middot;</span>
              <span>
                {new Date(article.publishedAt).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}
