import { create } from 'zustand';
import type { JobSummary, Watchlist, WatchlistJobsResponse } from '../types';

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

  // Watchlists — fetched by Layout (always mounted), updated by Home on CRUD
  watchlists: Watchlist[];
  setWatchlists: (watchlists: Watchlist[]) => void;
  addWatchlist: (watchlist: Watchlist) => void;
  updateWatchlist: (watchlist: Watchlist) => void;
  removeWatchlist: (id: number) => void;

  // Stock symbols per watchlist — for nav display only (no scores etc.)
  // Only populated for watchlists whose stocks have been fetched.
  // Mutations are no-ops if the watchlist isn't loaded yet.
  stocksByWatchlist: Record<number, string[]>;
  setWatchlistStocks: (watchlistId: number, symbols: string[]) => void;
  addWatchlistStocks: (watchlistId: number, symbols: string[]) => void;
  removeWatchlistStock: (watchlistId: number, symbol: string) => void;

  // Nav expand state — persisted to localStorage
  expandedWatchlistIds: Record<number, boolean>;
  toggleWatchlistExpanded: (id: number) => void;

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

  watchlists: [],
  setWatchlists: (watchlists) => set({ watchlists }),
  addWatchlist: (watchlist) => set((s) => ({ watchlists: [...s.watchlists, watchlist] })),
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
  setWatchlistStocks: (watchlistId, symbols) =>
    set((s) => ({ stocksByWatchlist: { ...s.stocksByWatchlist, [watchlistId]: symbols } })),
  addWatchlistStocks: (watchlistId, symbols) =>
    set((s) => {
      const current = s.stocksByWatchlist[watchlistId];
      if (!current) return s;
      return {
        stocksByWatchlist: {
          ...s.stocksByWatchlist,
          [watchlistId]: [...new Set([...current, ...symbols])],
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
          [watchlistId]: current.filter((sym) => sym !== symbol),
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
