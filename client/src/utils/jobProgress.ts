import type { JobStep } from '../types';

const STEP_ORDER: JobStep[] = ['basic_info', 'earnings', 'forecast', 'document'];

export function computeProgress(
  currentStep: JobStep,
  stepAvgMs: Record<string, number>,
): { value: number; label: string | null } {
  const completedIdx = STEP_ORDER.indexOf(currentStep);
  if (completedIdx < 0) return { value: 0, label: null };

  const totalMs = STEP_ORDER.reduce((sum, s) => sum + (stepAvgMs[s] ?? 0), 0);
  if (totalMs === 0) {
    return { value: Math.round((completedIdx / STEP_ORDER.length) * 100), label: null };
  }

  const doneMs = STEP_ORDER.slice(0, completedIdx).reduce((sum, s) => sum + (stepAvgMs[s] ?? 0), 0);
  const value = Math.round((doneMs / totalMs) * 100);

  const remainingMs = totalMs - doneMs;
  const label = remainingMs > 0 ? `~${Math.ceil(remainingMs / 1000)}s` : null;

  return { value, label };
}
