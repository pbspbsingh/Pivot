import { create } from 'zustand';
import type { Watchlist } from '../types';

interface AppState {
  watchlists: Watchlist[];
  connected: boolean;
  setWatchlists: (watchlists: Watchlist[]) => void;
  setConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  watchlists: [],
  connected: false,
  setWatchlists: (watchlists) => set({ watchlists }),
  setConnected: (connected) => set({ connected }),
}));
