import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconAlertCircle, IconRotateClockwise, IconTrash, IconRefresh } from '@tabler/icons-react';
import type { JobSummary } from '../types';
import { computeProgress, STEP_LABELS } from '../utils/jobProgress';
import { AnimatedTime } from './AnimatedTime';

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
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (job?.status !== 'running') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job?.status]);

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
    const { value, elapsed, expected } = computeProgress(job.step, null, job.accumulated_ms, stepAvgMs, nowMs);
    return (
      <Stack gap={2} style={{ minWidth: 120 }}>
        <Group justify="space-between" gap={4}>
          <Badge color="violet" variant="light" size="sm">Score Queued</Badge>
          <Text size="xs" c="dimmed"><AnimatedTime time={elapsed} />{expected && ` / ${expected}`}</Text>
        </Group>
        <Progress value={value} size="xs" color="blue" />
      </Stack>
    );
  }

  const stepLabel = STEP_LABELS[job.step] ?? job.step;
  const { value, elapsed, expected } = computeProgress(job.step, job.phase_started_at, job.accumulated_ms, stepAvgMs, nowMs);

  return (
    <Stack gap={2} style={{ minWidth: 120 }}>
      <Group justify="space-between" gap={4}>
        <Text size="xs" c="dimmed">{stepLabel}</Text>
        <Text size="xs" c="dimmed"><AnimatedTime time={elapsed} />{expected && ` / ${expected}`}</Text>
      </Group>
      <Progress value={value} animated={value === 0} size="xs" color="blue" />
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
