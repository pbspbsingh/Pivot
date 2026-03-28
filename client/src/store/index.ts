import { create } from 'zustand';
import type { Watchlist } from '../types';

interface AppState {
  watchlists: Watchlist[];
  setWatchlists: (watchlists: Watchlist[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  watchlists: [],
  setWatchlists: (watchlists) => set({ watchlists }),
}));
