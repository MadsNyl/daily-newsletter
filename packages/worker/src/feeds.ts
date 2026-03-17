export interface FeedSource {
  name: string;
  url: string;
}

export const feeds: FeedSource[] = [
  { name: "NRK", url: "https://www.nrk.no/toppsaker.rss" },
  { name: "VG", url: "https://www.vg.no/rss/feed/" },
  { name: "Dagbladet", url: "https://www.dagbladet.no/rss" },
];
