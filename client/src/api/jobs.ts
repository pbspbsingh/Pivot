import { api } from './index';
import type { StepAttempt, StockAnalysis, WatchlistJobsResponse } from '../types';

export const jobsApi = {
  listWatchlistJobs: (watchlistId: number) =>
    api.get<WatchlistJobsResponse>(`/watchlists/${watchlistId}/stocks/jobs`),
  analyze: (watchlistId: number, symbol: string) =>
    api.post<number>(`/watchlists/${watchlistId}/stocks/${symbol}/analyze`, {}),
  getJobLog: (jobId: number) => api.get<StepAttempt[]>(`/jobs/${jobId}/log`),
  getAnalysis: (watchlistId: number, symbol: string) =>
    api.get<StockAnalysis>(`/watchlists/${watchlistId}/stocks/${symbol}/analysis`),
};
