import { ActionIcon, Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconAlertCircle, IconRotateClockwise, IconTrash, IconRefresh } from '@tabler/icons-react';
import type { JobSummary } from '../types';
import { computeProgress, STEP_LABELS } from '../utils/jobProgress';

interface Props {
  job: JobSummary | undefined;
  stepAvgMs: Record<string, number>;
  isDeleted: boolean;
  onAnalyze: () => void;
  onViewLog: (jobId: number) => void;
  onDelete: () => void;
  onRestore: () => void;
}

export function JobStatusCell({ job, stepAvgMs }: Pick<Props, 'job' | 'stepAvgMs'>) {
  if (!job || job.status === 'completed') {
    return <Text size="xs" c={job?.status === 'completed' ? 'teal' : 'dimmed'}>{job?.status === 'completed' ? 'Done' : '—'}</Text>;
  }

  if (job.status === 'failed') {
    return <Badge color="red" variant="light" size="sm" leftSection={<IconAlertCircle size={10} />}>Failed</Badge>;
  }

  if (job.status === 'pending') {
    return <Badge color="gray" variant="light" size="sm">Queued</Badge>;
  }

  if (job.step === 'score_queued') {
    return <Badge color="violet" variant="light" size="sm">Score Queued</Badge>;
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
      <Progress value={progressValue} animated={progressValue === 0} size="xs" color="blue" />
    </Stack>
  );
}

export function JobActionsCell({ job, isDeleted, onAnalyze, onViewLog, onDelete, onRestore }: Omit<Props, 'stepAvgMs'>) {
  const isRunning = job?.status === 'pending' || job?.status === 'running' || job?.status === 'partial_completed';

  return (
    <Group gap={4} wrap="nowrap">
      {!isDeleted && (
        <>
          {job?.status === 'failed' && (
            <Tooltip label="View error log" position="left">
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onViewLog(job.job_id)}>
                <IconAlertCircle size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={job?.status === 'failed' ? 'Retry' : 'Run analysis'} position="left">
            <ActionIcon variant="subtle" color="blue" size="sm" onClick={onAnalyze} disabled={isRunning}>
              {job?.status === 'failed' ? <IconRotateClockwise size={14} /> : <IconPlayerPlay size={14} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove" position="left">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
      {isDeleted && (
        <Tooltip label="Restore" position="left">
          <ActionIcon variant="subtle" color="green" size="sm" onClick={onRestore}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

