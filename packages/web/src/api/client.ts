const API_BASE = import.meta.env.VITE_API_URL || "";

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

export interface CompanyArticle {
  id: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string | null;
}

export interface CompanyDetail {
  ticker: string;
  name: string;
  articles: CompanyArticle[];
}

export interface CompanyQuote {
  price: number | null;
  currency: string;
  changeIntraDay: number | null;
  changePctIntraDay: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  marketCap: number | null;
  peValue: number | null;
  analysts: {
    buy: number;
    overweight: number;
    hold: number;
    underweight: number;
    sell: number;
  };
  topOwners: { investor: string; percentageOfTotal: number }[];
}

export interface ChartData {
  timestamps: number[];
  close: number[];
  volume: number[];
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
  const url = `${API_BASE}/api/newsletters/${date}${query ? `?${query}` : ""}`;
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
  const res = await fetch(`${API_BASE}/api/newsletters?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Failed to fetch editions: ${res.statusText}`);
  return res.json();
}

export async function fetchCompanies(date?: string): Promise<Company[]> {
  const url = date ? `${API_BASE}/api/companies?date=${date}` : `${API_BASE}/api/companies`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

export async function fetchCompanyDetail(
  ticker: string,
  limit = 20,
  offset = 0,
): Promise<{
  data: CompanyDetail;
  pagination: { limit: number; offset: number; total: number };
}> {
  const res = await fetch(`${API_BASE}/api/companies/${ticker}?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Failed to fetch company detail: ${res.statusText}`);
  return res.json();
}

export async function fetchCompanyQuote(ticker: string): Promise<CompanyQuote> {
  const res = await fetch(`${API_BASE}/api/companies/${ticker}/quote`);
  if (!res.ok) throw new Error(`Failed to fetch quote: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchCompanyChart(ticker: string, range = "1d"): Promise<ChartData> {
  const res = await fetch(`${API_BASE}/api/companies/${ticker}/chart?range=${range}`);
  if (!res.ok) throw new Error(`Failed to fetch chart: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}
