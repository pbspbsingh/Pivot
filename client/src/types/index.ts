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
  score: number | null;
  analyzed_at: string | null;
  added_at: string;
}

export interface WatchlistSnapshot extends Watchlist {
  stocks: Stock[];
}

export type JobStatus = 'pending' | 'running' | 'partial_completed' | 'completed' | 'failed';

export type JobStep =
  | 'queued'
  | 'basic_info'
  | 'earnings'
  | 'forecast'
  | 'document'
  | 'score_queued'
  | 'scoring'
  | 'done'
  | 'failed';

export interface JobSummary {
  job_id: number;
  symbol: string;
  watchlist_id: number;
  status: JobStatus;
  step: JobStep;
  error: string | null;
  phase_started_at: string | null;
  accumulated_ms: number;
}

export interface WatchlistJobsResponse {
  jobs: JobSummary[];
  step_avg_ms: Record<string, number>;
}

export interface StockBasicInfo {
  sector: string;
  industry: string;
  description: string | null;
}

export interface EarningsEntry {
  period_label: string;
  periodicity: 'Quarterly' | 'Annual' | 'HalfYearly';
  eps_reported: number | null;
  eps_estimate: number | null;
  eps_surprise_pct: number | null;
  eps_yoy_growth: number | null;
  revenue_reported: number | null;
  revenue_estimate: number | null;
  revenue_surprise_pct: number | null;
  revenue_yoy_growth: number | null;
}

export interface EarningsData {
  quarterly_earnings: EarningsEntry[];
  annual_earnings: EarningsEntry[];
}

export interface ForecastData {
  price_current: number | null;
  price_target_average: number | null;
  price_target_average_upside_pct: number | null;
  price_target_max: number | null;
  price_target_min: number | null;
  price_target_analyst_count: number | null;
  rating_strong_buy: number | null;
  rating_buy: number | null;
  rating_hold: number | null;
  rating_sell: number | null;
  rating_strong_sell: number | null;
  rating_total_analysts: number | null;
  rating_consensus: string | null;
}

export interface EarningsRelease {
  day: string;
  earnings_release: string;
}

export interface CriteriaEntry {
  score: number;
  reason: string;
}

export interface StockScore {
  score: number;
  criteria: Record<string, CriteriaEntry>;
  last_updated: string;
}

export interface StockAnalysis {
  exchange: string;
  basic_info: StockBasicInfo;
  earnings: EarningsData;
  forecast: ForecastData;
  document: EarningsRelease;
  score: StockScore | null;
  analyzed_at: string;
}

export type AttemptStatus = 'success' | 'failed';

export interface StepAttempt {
  step: JobStep;
  attempt: number;
  status: AttemptStatus;
  error: string | null;
  duration_ms: number | null;
  started_at: string;
}
