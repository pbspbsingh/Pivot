import { api } from './index';
import type { Stock, Watchlist } from '../types';

export const watchlistApi = {
  list: () => api.get<Watchlist[]>('/watchlists'),
  create: (name: string) => api.post<Watchlist>('/watchlists', { name }),
  rename: (id: number, name: string) => api.patch<Watchlist>(`/watchlists/${id}`, { name }),
  delete: (id: number) => api.delete<void>(`/watchlists/${id}`),
  listStocks: (id: number) => api.get<Stock[]>(`/watchlists/${id}/stocks`),
  addStocks: (id: number, symbols: string[]) => api.post<void>(`/watchlists/${id}/stocks`, { symbols }),
  deleteStock: (id: number, symbol: string) => api.delete<void>(`/watchlists/${id}/stocks/${symbol}`),
  restoreStock: (id: number, symbol: string) => api.post<void>(`/watchlists/${id}/stocks/${symbol}/restore`, {}),
};
