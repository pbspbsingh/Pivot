import { useEffect, useState } from 'react';
import { Code, Loader, Modal, Stack, Table, Text } from '@mantine/core';
import { jobsApi } from '../api/jobs';
import type { StepAttempt } from '../types';
import { notifyError } from '../utils/notify';

interface Props {
  jobId: number | null;
  symbol: string;
  onClose: () => void;
}

export function JobLogModal({ jobId, symbol, onClose }: Props) {
  const [log, setLog] = useState<StepAttempt[]>([]);
  const [loadedForJobId, setLoadedForJobId] = useState<number | null>(null);
  const loading = jobId != null && loadedForJobId !== jobId;

  useEffect(() => {
    if (jobId == null) return;
    jobsApi
      .getJobLog(jobId)
      .then((data) => {
        setLog(data);
        setLoadedForJobId(jobId);
      })
      .catch((e: Error) => notifyError(e.message));
  }, [jobId]);

  return (
    <Modal
      opened={jobId != null}
      onClose={onClose}
      title={`Job log — ${symbol}`}
      size="xl"
    >
      {loading ? (
        <Loader size="sm" />
      ) : log.length === 0 ? (
        <Text c="dimmed" size="sm">No attempts recorded.</Text>
      ) : (
        <Stack gap="xs">
          <Table withTableBorder withColumnBorders fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Step</Table.Th>
                <Table.Th>Attempt</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>Started</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {log.map((row, i) => (
                <Table.Tr key={i}>
                  <Table.Td ff="monospace">{row.step}</Table.Td>
                  <Table.Td>{row.attempt}</Table.Td>
                  <Table.Td c={row.status === 'success' ? 'teal' : 'red'}>{row.status}</Table.Td>
                  <Table.Td>{row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}</Table.Td>
                  <Table.Td c="dimmed">{new Date(row.started_at + 'Z').toLocaleTimeString()}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {log.filter((r) => r.error).map((row, i) => (
            <Stack key={i} gap={2}>
              <Text size="xs" fw={600} c="red">{row.step} attempt {row.attempt}</Text>
              <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {row.error}
              </Code>
            </Stack>
          ))}
        </Stack>
      )}
    </Modal>
  );
}
