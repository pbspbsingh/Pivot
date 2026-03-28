import { useEffect, useState } from 'react';
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
import type { Stock, Watchlist } from '../../types';
import { notifyError } from '../../utils/notify';

type SortKey = 'symbol' | 'sector' | 'industry' | 'score' | 'score_updated_at';

interface Props {
  watchlist: Watchlist;
}

export function WatchlistPanel({ watchlist }: Props) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [deletedSymbols, setDeletedSymbols] = useState<Set<string>>(new Set());
  const [tickerInput, setTickerInput] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const scoreLabel = watchlist.is_default ? 'EP Score' : 'VCP Score';

  useEffect(() => {
    setDeletedSymbols(new Set());
    watchlistApi.listStocks(watchlist.id)
      .then(setStocks)
      .catch((e: Error) => notifyError(e.message));
  }, [watchlist.id]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }

  function getScore(stock: Stock): number | null {
    return watchlist.is_default ? stock.ep_score : stock.vcp_score;
  }

  const sortedStocks = [...stocks].sort((a, b) => {
    let aVal: string | number | null;
    let bVal: string | number | null;

    if (sortBy === 'score') {
      aVal = getScore(a);
      bVal = getScore(b);
    } else if (sortBy === 'score_updated_at') {
      aVal = a.score_updated_at;
      bVal = b.score_updated_at;
    } else {
      aVal = a[sortBy];
      bVal = b[sortBy];
    }

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
        const updated = await watchlistApi.listStocks(watchlist.id);
        setStocks(updated);
      }
      if (failed.length > 0) {
        notifyError(`Exchange not found for: ${failed.join(', ')}`);
      }
      if (added.length > 0) {
        setTickerInput('');
      }
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleDelete(symbol: string) {
    try {
      await watchlistApi.deleteStock(watchlist.id, symbol);
      setDeletedSymbols((prev) => new Set([...prev, symbol]));
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
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = sortBy === sortKey;
    return (
      <UnstyledButton onClick={() => toggleSort(sortKey)}>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={active ? 700 : 500}>{label}</Text>
          {active && (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
        </Group>
      </UnstyledButton>
    );
  }

  return (
    <Stack gap="sm">
      <Table highlightOnHover striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th><SortHeader label="Symbol" sortKey="symbol" /></Table.Th>
            <Table.Th><SortHeader label="Sector" sortKey="sector" /></Table.Th>
            <Table.Th><SortHeader label="Industry" sortKey="industry" /></Table.Th>
            <Table.Th><SortHeader label={scoreLabel} sortKey="score" /></Table.Th>
            <Table.Th><SortHeader label="Score Updated" sortKey="score_updated_at" /></Table.Th>
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
                <Table.Td>{getScore(stock) ?? '—'}</Table.Td>
                <Table.Td c="dimmed">
                  {stock.score_updated_at
                    ? new Date(stock.score_updated_at).toLocaleString()
                    : '—'}
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
              <Table.Td colSpan={6}>
                <Text c="dimmed" ta="center" py="sm">No stocks in this watchlist.</Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Stack gap={4} maw={400}>
        <Text size="xs" fw={500} c="dimmed">Add Tickers</Text>
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
          <Button size="xs" onClick={handleAddStocks}>Add</Button>
        </Group>
      </Stack>
    </Stack>
  );
}
