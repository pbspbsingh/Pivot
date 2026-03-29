import { useState } from 'react';
import { ActionIcon, Box, Group, Progress, Text, Tooltip } from '@mantine/core';
import { IconList } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { JobLogModal } from '../../components/JobLogModal';
import { computeProgress } from '../../utils/jobProgress';

const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  basic_info: 'Basic Info',
  earnings: 'Earnings',
  forecast: 'Forecast',
  document: 'Earnings Release',
  done: 'Done',
};

export function Stock() {
  const { watchlistId, symbol } = useParams<{ watchlistId: string; symbol: string }>();
  const job = useAppStore(
    (s) => s.jobsByWatchlist[Number(watchlistId)]?.[symbol ?? ''],
  );

  const stepAvgMs = useAppStore((s) => s.stepAvgMs);
  const [logOpen, setLogOpen] = useState(false);
  const isActive = job?.status === 'pending' || job?.status === 'running';
  const isFailed = job?.status === 'failed';

  return (
    <Box>
      {(isActive || isFailed) && (
        <Box
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--mantine-color-dark-7)',
            borderBottom: `1px solid var(--mantine-color-${isFailed ? 'red' : 'blue'}-7)`,
          }}
        >
          {!isFailed && (() => {
            const { value } = job.status === 'pending'
              ? { value: 0 }
              : computeProgress(job.step, stepAvgMs);
            return (
              <Progress
                value={value}
                animated={value === 0}
                size={2}
                color="blue.4"
                radius={0}
              />
            );
          })()}
          <Group px="md" py={4} justify="space-between">
            <Text size="xs" c={isFailed ? 'red.3' : 'blue.3'}>
              {isFailed
                ? `Failed — ${job.error ?? 'unknown error'}`
                : job.status === 'pending'
                  ? 'Queued'
                  : (STEP_LABELS[job.step] ?? job.step)}
            </Text>
            <Tooltip label="View logs" position="left">
              <ActionIcon variant="subtle" color={isFailed ? 'red' : 'blue'} size="xs" onClick={() => setLogOpen(true)}>
                <IconList size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      )}
      <Box p="md">
        <Text fw={700} size="xl">{symbol}</Text>
      </Box>
      <JobLogModal
        jobId={logOpen && job ? job.job_id : null}
        symbol={symbol ?? ''}
        onClose={() => setLogOpen(false)}
      />
    </Box>
  );
}
