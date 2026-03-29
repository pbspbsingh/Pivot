import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { IconRefresh, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { watchlistApi } from '../../api/watchlists';
import { jobsApi } from '../../api/jobs';
import { useAppStore } from '../../store';
import type { Stock, Watchlist } from '../../types';
import { notifyError } from '../../utils/notify';
import { JobStatusCell } from '../../components/JobStatusCell';
import { JobLogModal } from '../../components/JobLogModal';
import type { JobSummary } from '../../types';

const EMPTY_JOBS: Record<string, JobSummary> = {};

type SortKey = 'symbol' | 'sector' | 'industry' | 'score' | 'analyzed_at';

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onToggle: (key: SortKey) => void;
}

function SortHeader({ label, sortKey, sortBy, sortDir, onToggle }: SortHeaderProps) {
  const active = sortBy === sortKey;
  return (
    <UnstyledButton onClick={() => onToggle(sortKey)}>
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={active ? 700 : 500}>
          {label}
        </Text>
        {active && (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
      </Group>
    </UnstyledButton>
  );
}

interface Props {
  watchlist: Watchlist;
}

export function WatchlistPanel({ watchlist }: Props) {
  const setWatchlistStocks = useAppStore((s) => s.setWatchlistStocks);
  const addWatchlistStocks = useAppStore((s) => s.addWatchlistStocks);
  const removeWatchlistStock = useAppStore((s) => s.removeWatchlistStock);
  const setWatchlistJobs = useAppStore((s) => s.setWatchlistJobs);
  const updateJob = useAppStore((s) => s.updateJob);
  const jobsBySymbol = useAppStore((s) => s.jobsByWatchlist[watchlist.id]) ?? EMPTY_JOBS;
  const stepAvgMs = useAppStore((s) => s.stepAvgMs);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [deletedSymbols, setDeletedSymbols] = useState<Set<string>>(new Set());
  const [tickerInput, setTickerInput] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [logJobId, setLogJobId] = useState<number | null>(null);
  const [logSymbol, setLogSymbol] = useState('');
  const prevJobsRef = useRef<typeof jobsBySymbol>({});

  const scoreLabel = watchlist.is_default ? 'EP Score' : 'VCP Score';

  useEffect(() => {
    watchlistApi
      .listStocks(watchlist.id)
      .then((s) => {
        setStocks(s);
        setDeletedSymbols(new Set());
        setWatchlistStocks(
          watchlist.id,
          s.map((stock) => stock.symbol),
        );
      })
      .catch((e: Error) => notifyError(e.message));

    jobsApi
      .listWatchlistJobs(watchlist.id)
      .then((data) => setWatchlistJobs({ watchlistId: watchlist.id, ...data }))
      .catch((e: Error) => notifyError(e.message));
  }, [watchlist.id, setWatchlistStocks, setWatchlistJobs]);

  useEffect(() => {
    const prev = prevJobsRef.current;
    const newlyCompleted = Object.values(jobsBySymbol).some(
      (job) => job.status === 'completed' && prev[job.symbol]?.status !== 'completed',
    );
    if (newlyCompleted) {
      watchlistApi
        .listStocks(watchlist.id)
        .then(setStocks)
        .catch((e: Error) => notifyError(e.message));
    }
    prevJobsRef.current = jobsBySymbol;
  }, [jobsBySymbol, watchlist.id]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }

  const sortedStocks = [...stocks].sort((a, b) => {
    const aVal: string | null = sortBy === 'score' ? null : a[sortBy];
    const bVal: string | null = sortBy === 'score' ? null : b[sortBy];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function parseSymbols(input: string): string[] {
    return input
      .split(/[\n, ]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
  }

  async function handleAddStocks() {
    const symbols = parseSymbols(tickerInput);
    if (symbols.length === 0) return;
    try {
      const { added, failed } = await watchlistApi.addStocks(watchlist.id, symbols);
      if (added.length > 0) {
        const [updated, jobsData] = await Promise.all([
          watchlistApi.listStocks(watchlist.id),
          jobsApi.listWatchlistJobs(watchlist.id),
        ]);
        setStocks(updated);
        setWatchlistStocks(
          watchlist.id,
          updated.map((s) => s.symbol),
        );
        setWatchlistJobs({ watchlistId: watchlist.id, ...jobsData });
        setTickerInput('');
      }
      if (failed.length > 0) {
        notifyError(`Exchange not found for: ${failed.join(', ')}`);
      }
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleDelete(symbol: string) {
    try {
      await watchlistApi.deleteStock(watchlist.id, symbol);
      setDeletedSymbols((prev) => new Set([...prev, symbol]));
      removeWatchlistStock(watchlist.id, symbol);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleRestore(symbol: string) {
    try {
      await watchlistApi.restoreStock(watchlist.id, symbol);
      setDeletedSymbols((prev) => {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      });
      addWatchlistStocks(watchlist.id, [symbol]);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleAnalyze(symbol: string) {
    try {
      await jobsApi.analyze(watchlist.id, symbol);
      const current = jobsBySymbol[symbol];
      if (current) {
        updateJob({ ...current, status: 'pending', step: 'queued' });
      }
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  return (
    <Stack gap="sm">
      <Table highlightOnHover striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <SortHeader label="Symbol" sortKey="symbol" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort} />
            </Table.Th>
            <Table.Th>
              <SortHeader label="Sector" sortKey="sector" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort} />
            </Table.Th>
            <Table.Th>
              <SortHeader label="Industry" sortKey="industry" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort} />
            </Table.Th>
            <Table.Th>
              <SortHeader label={scoreLabel} sortKey="score" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort} />
            </Table.Th>
            <Table.Th>
              <SortHeader label="Analyzed" sortKey="analyzed_at" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort} />
            </Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedStocks.map((stock) => {
            const isDeleted = deletedSymbols.has(stock.symbol);
            return (
              <Table.Tr
                key={stock.symbol}
                style={{ opacity: isDeleted ? 0.4 : 1, textDecoration: isDeleted ? 'line-through' : 'none' }}
              >
                <Table.Td fw={600}>{stock.symbol}</Table.Td>
                <Table.Td c="dimmed">{stock.sector ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{stock.industry ?? '—'}</Table.Td>
                <Table.Td c="dimmed">—</Table.Td>
                <Table.Td c="dimmed">
                  {stock.analyzed_at ? new Date(stock.analyzed_at + 'Z').toLocaleString() : '—'}
                </Table.Td>
                <Table.Td>
                  {!isDeleted && (
                    <JobStatusCell
                      symbol={stock.symbol}
                      watchlistId={watchlist.id}
                      job={jobsBySymbol[stock.symbol]}
                      stepAvgMs={stepAvgMs}
                      onAnalyze={() => handleAnalyze(stock.symbol)}
                      onViewLog={(jobId) => {
                        setLogJobId(jobId);
                        setLogSymbol(stock.symbol);
                      }}
                    />
                  )}
                </Table.Td>
                <Table.Td>
                  {isDeleted ? (
                    <ActionIcon variant="subtle" color="green" size="sm" onClick={() => handleRestore(stock.symbol)}>
                      <IconRefresh size={14} />
                    </ActionIcon>
                  ) : (
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDelete(stock.symbol)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
          {sortedStocks.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed" ta="center" py="sm">
                  No stocks in this watchlist.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Stack gap={4} maw={400}>
        <Text size="xs" fw={500} c="dimmed">
          Add Tickers
        </Text>
        <Textarea
          placeholder={'One per line or comma-separated\ne.g. AAPL, TSLA\nNVDA'}
          value={tickerInput}
          onChange={(e) => setTickerInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddStocks();
          }}
          autosize
          minRows={2}
          maxRows={6}
        />
        <Group justify="flex-end">
          <Button size="xs" onClick={handleAddStocks}>
            Add
          </Button>
        </Group>
      </Stack>

      <JobLogModal
        jobId={logJobId}
        symbol={logSymbol}
        onClose={() => setLogJobId(null)}
      />
    </Stack>
  );
}
