import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Group,
  ScrollArea,
  Table,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowUp, IconArrowDown, IconRefresh, IconPlus } from '@tabler/icons-react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import { watchlistApi } from '../../api/watchlists';
import { jobsApi } from '../../api/jobs';
import { useAppStore } from '../../store';
import type { Stock, Watchlist } from '../../types';
import { notifyError } from '../../utils/notify';
import { JobStatusCell, JobActionsCell } from '../../components/JobStatusCell';
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
  const [inputFocused, setInputFocused] = useState(false);
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
          s.map((stock) => ({ symbol: stock.symbol, score: stock.score, added_at: stock.added_at })),
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
        .then((s) => {
          setStocks(s);
          setWatchlistStocks(watchlist.id, s.map((stock) => ({ symbol: stock.symbol, score: stock.score, added_at: stock.added_at })));
        })
        .catch((e: Error) => notifyError(e.message));
    }
    prevJobsRef.current = jobsBySymbol;
  }, [jobsBySymbol, watchlist.id, setWatchlistStocks]);

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
          updated.map((s) => ({ symbol: s.symbol, score: s.score, added_at: s.added_at })),
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
      const restored = stocks.find((s) => s.symbol === symbol);
      addWatchlistStocks(watchlist.id, [{ symbol, score: restored?.score ?? null, added_at: restored?.added_at ?? '' }]);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleRestartAll() {
    const active = sortedStocks.filter((s) => {
      if (deletedSymbols.has(s.symbol)) return false;
      const status = jobsBySymbol[s.symbol]?.status;
      return status !== 'pending' && status !== 'running' && status !== 'partial_completed';
    });
    await Promise.all(active.map((s) => handleAnalyze(s.symbol)));
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

  const inputExpanded = inputFocused || tickerInput.length > 0;

  return (
    <div style={{ paddingBottom: 90 }}>
      <ScrollArea>
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
            <Table.Th>Actions</Table.Th>
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
                <Table.Td fw={500}>
                  <RouterNavLink to={`/stock/${watchlist.id}/${stock.symbol}`} style={{ color: 'var(--mantine-color-blue-4)', textDecoration: 'none' }}>
                    {stock.symbol}
                  </RouterNavLink>
                </Table.Td>
                <Table.Td c="dimmed">{stock.sector ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{stock.industry ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{stock.score != null ? stock.score.toFixed(1) : '—'}</Table.Td>
                <Table.Td c="dimmed">
                  {stock.analyzed_at ? new Date(stock.analyzed_at + 'Z').toLocaleString() : '—'}
                </Table.Td>
                <Table.Td>
                  {!isDeleted && (
                    <JobStatusCell job={jobsBySymbol[stock.symbol]} stepAvgMs={stepAvgMs} />
                  )}
                </Table.Td>
                <Table.Td>
                  <JobActionsCell
                    job={jobsBySymbol[stock.symbol]}
                    isDeleted={isDeleted}
                    onAnalyze={() => handleAnalyze(stock.symbol)}
                    onViewLog={(jobId) => { setLogJobId(jobId); setLogSymbol(stock.symbol); }}
                    onDelete={() => handleDelete(stock.symbol)}
                    onRestore={() => handleRestore(stock.symbol)}
                  />
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
      </ScrollArea>

      {/* Sticky footer — fixed to bottom of viewport, inset to account for navbar and padding */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 'calc(220px + var(--mantine-spacing-xs))',
        right: 'var(--mantine-spacing-xs)',
        borderTop: '1px solid var(--mantine-color-dark-4)',
        background: 'var(--mantine-color-dark-8)',
        padding: '8px',
        zIndex: 100,
      }}>
        <Group gap="xs" align="flex-end">
          <div style={{
            flex: 1,
            maxHeight: inputExpanded ? '180px' : '38px',
            transition: 'max-height 0.25s ease',
            overflow: 'hidden',
          }}>
            <Textarea
              placeholder="Add tickers: AAPL, TSLA, NVDA"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddStocks(); }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              autosize
              minRows={inputExpanded ? 5 : 1}
              maxRows={5}
            />
          </div>
          <Tooltip label="Ctrl+Enter to add" position="top">
            <Button size="sm" leftSection={<IconPlus size={14} />} onClick={handleAddStocks}>Add</Button>
          </Tooltip>
          <Tooltip label="Re-run analysis for all tickers" position="top">
            <Button size="sm" variant="subtle" color="gray" leftSection={<IconRefresh size={14} />} onClick={handleRestartAll}>
              Restart All
            </Button>
          </Tooltip>
        </Group>
      </div>

      <JobLogModal
        jobId={logJobId}
        symbol={logSymbol}
        onClose={() => setLogJobId(null)}
      />
    </div>
  );
}
