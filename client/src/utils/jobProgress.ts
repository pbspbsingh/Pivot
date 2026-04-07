import type { JobStep } from '../types';

export const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  basic_info: 'Basic Info',
  earnings: 'Earnings',
  forecast: 'Forecast',
  document: 'Earnings Release',
  score_queued: 'Score Queued',
  scoring: 'Scoring',
  done: 'Done',
  failed: 'Failed',
};

const SCRAPING_STEPS: JobStep[] = ['basic_info', 'earnings', 'forecast', 'document'];

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function computeProgress(
  phaseStartedAt: string | null,
  accumulatedMs: number,
  stepAvgMs: Record<string, number>,
  nowMs: number,
): { value: number; elapsed: string; expected: string | null } {
  const scrapingTotal = SCRAPING_STEPS.reduce((sum, s) => sum + (stepAvgMs[s] ?? 0), 0);
  const scoringTotal = stepAvgMs['scoring'] ?? 0;
  const grandTotal = scrapingTotal + scoringTotal;

  let elapsedMs = accumulatedMs;
  if (phaseStartedAt) {
    elapsedMs += nowMs - new Date(phaseStartedAt + 'Z').getTime();
  }

  const value = grandTotal > 0 ? Math.min(Math.round((elapsedMs / grandTotal) * 100), 99) : 0;
  const elapsed = formatDuration(Math.max(0, Math.floor(elapsedMs / 1000)));
  const expected = grandTotal > 0 ? formatDuration(Math.floor(grandTotal / 1000)) : null;

  return { value, elapsed, expected };
}
