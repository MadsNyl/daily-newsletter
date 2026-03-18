export interface Company {
  ticker: string;
  name: string;
}

export interface Article {
  id: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string | null;
  status: string;
  order: number;
  companies: Company[];
}

export interface NewsletterEdition {
  id: string;
  date: string;
  summary: string | null;
  status: string;
  createdAt: string;
  articles: Article[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export async function fetchEdition(
  date: string,
  company?: string,
): Promise<NewsletterEdition | null> {
  const params = new URLSearchParams();
  if (company) params.set("company", company);
  const query = params.toString();
  const url = `/api/newsletters/${date}${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch edition: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchEditions(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<Omit<NewsletterEdition, "articles">>> {
  const res = await fetch(`/api/newsletters?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Failed to fetch editions: ${res.statusText}`);
  return res.json();
}

export async function fetchCompanies(date: string): Promise<Company[]> {
  const res = await fetch(`/api/companies?date=${date}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}
