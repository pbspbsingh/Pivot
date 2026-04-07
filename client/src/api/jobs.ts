import { api } from './index';
import type { StepAttempt, StockAnalysis, StockScore, WatchlistJobsResponse } from '../types';

export const jobsApi = {
  listWatchlistJobs: (watchlistId: number) =>
    api.get<WatchlistJobsResponse>(`/watchlists/${watchlistId}/stocks/jobs`),
  analyze: (watchlistId: number, symbol: string) =>
    api.post<number>(`/watchlists/${watchlistId}/stocks/${symbol}/analyze`, {}),
  getJobLog: (jobId: number) => api.get<StepAttempt[]>(`/jobs/${jobId}/log`),
  getAnalysis: (watchlistId: number, symbol: string) =>
    api.get<StockAnalysis>(`/watchlists/${watchlistId}/stocks/${symbol}/analysis`),
  getAnalysisSection: (watchlistId: number, symbol: string, section: string) =>
    api.get<Partial<StockAnalysis>>(`/watchlists/${watchlistId}/stocks/${symbol}/analysis?section=${section}`),
  saveScore: (watchlistId: number, symbol: string, score: StockScore) =>
    api.put<void>(`/watchlists/${watchlistId}/stocks/${symbol}/score`, score),
  getPrompt: (watchlistId: number, symbol: string) =>
    fetch(`/api/watchlists/${watchlistId}/stocks/${symbol}/prompt`).then((r) => r.text()),
};
