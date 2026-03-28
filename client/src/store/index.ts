import { create } from 'zustand';

type TabOrientation = 'vertical' | 'horizontal';

interface AppState {
  connected: boolean;
  tabOrientation: TabOrientation;
  setConnected: (connected: boolean) => void;
  setTabOrientation: (orientation: TabOrientation) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connected: false,
  tabOrientation: (localStorage.getItem('tabOrientation') as TabOrientation) ?? 'horizontal',
  setConnected: (connected) => set({ connected }),
  setTabOrientation: (tabOrientation) => {
    localStorage.setItem('tabOrientation', tabOrientation);
    set({ tabOrientation });
  },
}));
