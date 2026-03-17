import type { Article } from "../api/client";

export default function ArticleCard({ article }: { article: Article }) {
  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col sm:flex-row gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
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
