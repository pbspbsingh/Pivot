export interface Watchlist {
  id: number;
  name: string;
  is_default: boolean;
}

export interface Stock {
  symbol: string;
  sector: string | null;
  industry: string | null;
  ep_score: number | null;
  vcp_score: number | null;
  score_updated_at: string | null; // ISO 8601 datetime from server
}
