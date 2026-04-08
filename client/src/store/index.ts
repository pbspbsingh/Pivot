import { create } from 'zustand';
import type { JobSummary, Watchlist, WatchlistJobsResponse } from '../types';

export interface NavStock {
  symbol: string;
  score: number | null;
  added_at: string;
}

type TabOrientation = 'vertical' | 'horizontal';

interface AppState {
  // SSE connection
  connected: boolean;
  setConnected: (connected: boolean) => void;
  serverTime: string | null;
  setServerTime: (time: string) => void;

  // UI prefs
  tabOrientation: TabOrientation;
  setTabOrientation: (orientation: TabOrientation) => void;
  scorePanelLayout: 'split' | 'stacked';
  setScorePanelLayout: (layout: 'split' | 'stacked') => void;

  // Watchlists — fetched by Layout (always mounted), updated by Home on CRUD
  watchlists: Watchlist[];
  setWatchlists: (watchlists: Watchlist[]) => void;
  addWatchlist: (watchlist: Watchlist) => void;
  updateWatchlist: (watchlist: Watchlist) => void;
  removeWatchlist: (id: number) => void;

  // Stocks per watchlist — for nav display, includes score.
  // Only populated for watchlists whose stocks have been fetched.
  // Mutations are no-ops if the watchlist isn't loaded yet.
  stocksByWatchlist: Record<number, NavStock[]>;
  setWatchlistStocks: (watchlistId: number, stocks: NavStock[]) => void;
  addWatchlistStocks: (watchlistId: number, stocks: NavStock[]) => void;
  removeWatchlistStock: (watchlistId: number, symbol: string) => void;
  updateStockScore: (watchlistId: number, symbol: string, score: number) => void;

  // Nav expand state — persisted to localStorage
  expandedWatchlistIds: Record<number, boolean>;
  toggleWatchlistExpanded: (id: number) => void;

  // Nav sort — persisted to localStorage
  navSort: 'alpha' | 'date' | 'score';
  setNavSort: (sort: 'alpha' | 'date' | 'score') => void;

  // Job state — keyed by watchlistId, then symbol
  jobsByWatchlist: Record<number, Record<string, JobSummary>>;
  stepAvgMs: Record<string, number>;
  setWatchlistJobs: (data: WatchlistJobsResponse & { watchlistId: number }) => void;
  updateJob: (job: JobSummary) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
  serverTime: null,
  setServerTime: (serverTime) => set({ serverTime }),

  tabOrientation: (localStorage.getItem('tabOrientation') as TabOrientation) ?? 'horizontal',
  setTabOrientation: (tabOrientation) => {
    localStorage.setItem('tabOrientation', tabOrientation);
    set({ tabOrientation });
  },

  scorePanelLayout: (localStorage.getItem('scorePanelLayout') as 'split' | 'stacked') ?? 'stacked',
  setScorePanelLayout: (scorePanelLayout) => {
    localStorage.setItem('scorePanelLayout', scorePanelLayout);
    set({ scorePanelLayout });
  },

  watchlists: [],
  setWatchlists: (watchlists) => set({ watchlists }),
  addWatchlist: (watchlist) => set((s) => {
    const next = { ...s.expandedWatchlistIds, [watchlist.id]: false };
    localStorage.setItem('watchlistExpanded', JSON.stringify(next));
    return { watchlists: [...s.watchlists, watchlist], expandedWatchlistIds: next };
  }),
  updateWatchlist: (watchlist) =>
    set((s) => ({
      watchlists: s.watchlists.map((w) => (w.id === watchlist.id ? watchlist : w)),
    })),
  removeWatchlist: (id) =>
    set((s) => ({
      watchlists: s.watchlists.filter((w) => w.id !== id),
      stocksByWatchlist: Object.fromEntries(
        Object.entries(s.stocksByWatchlist).filter(([k]) => Number(k) !== id),
      ),
    })),

  stocksByWatchlist: {},
  setWatchlistStocks: (watchlistId, stocks) =>
    set((s) => ({ stocksByWatchlist: { ...s.stocksByWatchlist, [watchlistId]: stocks } })),
  addWatchlistStocks: (watchlistId, stocks) =>
    set((s) => {
      const current = s.stocksByWatchlist[watchlistId];
      if (!current) return s;
      const existing = new Set(current.map((s) => s.symbol));
      return {
        stocksByWatchlist: {
          ...s.stocksByWatchlist,
          [watchlistId]: [...current, ...stocks.filter((s) => !existing.has(s.symbol))],
        },
      };
    }),
  removeWatchlistStock: (watchlistId, symbol) =>
    set((s) => {
      const current = s.stocksByWatchlist[watchlistId];
      if (!current) return s;
      return {
        stocksByWatchlist: {
          ...s.stocksByWatchlist,
          [watchlistId]: current.filter((s) => s.symbol !== symbol),
        },
      };
    }),
  updateStockScore: (watchlistId, symbol, score) =>
    set((s) => {
      const current = s.stocksByWatchlist[watchlistId];
      if (!current) return s;
      return {
        stocksByWatchlist: {
          ...s.stocksByWatchlist,
          [watchlistId]: current.map((s) => s.symbol === symbol ? { ...s, score } : s),
        },
      };
    }),

  expandedWatchlistIds: JSON.parse(localStorage.getItem('watchlistExpanded') ?? '{}'),
  toggleWatchlistExpanded: (id) =>
    set((s) => {
      const next = { ...s.expandedWatchlistIds, [id]: !s.expandedWatchlistIds[id] };
      localStorage.setItem('watchlistExpanded', JSON.stringify(next));
      return { expandedWatchlistIds: next };
    }),

  navSort: (localStorage.getItem('navSort') ?? 'alpha') as 'alpha' | 'date' | 'score',
  setNavSort: (sort) => {
    localStorage.setItem('navSort', sort);
    set({ navSort: sort });
  },

  jobsByWatchlist: {},
  stepAvgMs: {},
  setWatchlistJobs: ({ watchlistId, jobs, step_avg_ms }) =>
    set((s) => ({
      jobsByWatchlist: {
        ...s.jobsByWatchlist,
        [watchlistId]: Object.fromEntries(jobs.map((j) => [j.symbol, j])),
      },
      stepAvgMs: step_avg_ms,
    })),
  updateJob: (job) =>
    set((s) => ({
      jobsByWatchlist: {
        ...s.jobsByWatchlist,
        [job.watchlist_id]: {
          ...(s.jobsByWatchlist[job.watchlist_id] ?? {}),
          [job.symbol]: job,
        },
      },
    })),
}));
