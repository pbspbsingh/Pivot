export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

export interface Watchlist {
  id: string;
  name: string;
  stocks: Stock[];
}
