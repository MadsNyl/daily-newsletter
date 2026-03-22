export interface FeedSource {
  name: string;
  url: string;
}

export const feeds: FeedSource[] = [
  { name: "E24", url: "https://e24.no/rss" },
  { name: "CNBC", url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
];
