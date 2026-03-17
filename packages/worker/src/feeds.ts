export interface FeedSource {
  name: string;
  url: string;
}

export const feeds: FeedSource[] = [
  { name: "E24", url: "https://e24.no/rss" },
];
