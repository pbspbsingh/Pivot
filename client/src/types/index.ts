export interface Watchlist {
  id: number;
  name: string;
  is_default: boolean;
  emoji: string;
}

export interface Stock {
  symbol: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  ep_score: number | null;
  vcp_score: number | null;
  score_updated_at: string | null; // ISO 8601 datetime from server
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JobStep =
  | 'queued'
  | 'basic_info'
  | 'earnings'
  | 'forecast'
  | 'document'
  | 'done'
  | 'failed';

export interface JobSummary {
  job_id: number;
  symbol: string;
  watchlist_id: number;
  status: JobStatus;
  step: JobStep;
  error: string | null;
}

export interface WatchlistJobsResponse {
  jobs: JobSummary[];
  step_avg_ms: Record<string, number>;
}

export interface StepAttempt {
  step: string;
  attempt: number;
  status: 'success' | 'failed';
  error: string | null;
  duration_ms: number | null;
  started_at: string;
}
