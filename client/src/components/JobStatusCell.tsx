import { ActionIcon, Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import type { JobSummary } from '../types';
import { computeProgress } from '../utils/jobProgress';


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

export function JobStatusCell({ job, stepAvgMs, onAnalyze, onViewLog }: Props) {
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
      <Group gap={4} wrap="nowrap">
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
        <Tooltip label="Retry" position="left">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onAnalyze}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
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

