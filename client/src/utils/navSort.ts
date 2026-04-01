import type { NavStock } from '../store';

export function sortNavStocks(stocks: NavStock[], sort: 'alpha' | 'date' | 'score'): NavStock[] {
  return [...stocks].sort((a, b) => {
    if (sort === 'date') {
      return a.added_at < b.added_at ? -1 : a.added_at > b.added_at ? 1 : 0;
    }
    if (sort === 'score') {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return -1;
      if (b.score == null) return 1;
      return a.score - b.score;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}
