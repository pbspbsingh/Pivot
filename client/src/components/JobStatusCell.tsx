import { ActionIcon, Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconAlertCircle } from '@tabler/icons-react';
import type { JobStep, JobSummary } from '../types';

const STEP_ORDER: JobStep[] = ['basic_info', 'earnings', 'forecast', 'document'];

const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  basic_info: 'Basic Info',
  earnings: 'Earnings',
  forecast: 'Forecast',
  document: 'Earnings Release',
  done: 'Done',
  failed: 'Failed',
};

interface Props {
  symbol: string;
  watchlistId: number;
  job: JobSummary | undefined;
  stepAvgMs: Record<string, number>;
  onAnalyze: () => void;
  onViewLog: (jobId: number) => void;
}

export function JobStatusCell({ symbol: _symbol, job, stepAvgMs, onAnalyze, onViewLog }: Props) {
  if (!job || job.status === 'completed') {
    return (
      <Group gap={4} wrap="nowrap">
        {job?.status === 'completed' && (
          <Text size="xs" c="teal">Done</Text>
        )}
        <Tooltip label="Run analysis" position="left">
          <ActionIcon variant="subtle" color="blue" size="sm" onClick={onAnalyze}>
            <IconPlayerPlay size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  if (job.status === 'failed') {
    return (
      <Tooltip label="View error log" position="left">
        <Badge
          color="red"
          variant="light"
          size="sm"
          style={{ cursor: 'pointer' }}
          leftSection={<IconAlertCircle size={10} />}
          onClick={() => onViewLog(job.job_id)}
        >
          Failed
        </Badge>
      </Tooltip>
    );
  }

  if (job.status === 'pending') {
    return <Badge color="gray" variant="light" size="sm">Queued</Badge>;
  }

  // Running — show step label + progress bar with timing estimate.
  const stepLabel = STEP_LABELS[job.step] ?? job.step;
  const { value: progressValue, label: etaLabel } = computeProgress(job.step, stepAvgMs);

  return (
    <Stack gap={2} style={{ minWidth: 120 }}>
      <Group justify="space-between" gap={4}>
        <Text size="xs" c="dimmed">{stepLabel}</Text>
        {etaLabel && <Text size="xs" c="dimmed">{etaLabel}</Text>}
      </Group>
      <Progress
        value={progressValue}
        animated={progressValue === 0}
        size="xs"
        color="blue"
      />
    </Stack>
  );
}

function computeProgress(
  currentStep: JobStep,
  stepAvgMs: Record<string, number>,
): { value: number; label: string | null } {
  const completedIdx = STEP_ORDER.indexOf(currentStep);
  if (completedIdx < 0) return { value: 0, label: null };

  const totalMs = STEP_ORDER.reduce((sum, s) => sum + (stepAvgMs[s] ?? 0), 0);
  if (totalMs === 0) return { value: 0, label: null };

  const doneMs = STEP_ORDER.slice(0, completedIdx).reduce((sum, s) => sum + (stepAvgMs[s] ?? 0), 0);
  const value = Math.round((doneMs / totalMs) * 100);

  const remainingMs = totalMs - doneMs;
  const label = remainingMs > 0 ? `~${Math.ceil(remainingMs / 1000)}s` : null;

  return { value, label };
}
