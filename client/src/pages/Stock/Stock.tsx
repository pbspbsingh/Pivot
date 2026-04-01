import { useEffect, useRef, useState } from 'react';
import { Accordion, ActionIcon, Badge, Box, Center, Code, Divider, Group, Loader, Progress, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconList, IconCopy, IconCheck } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { sortNavStocks } from '../../utils/navSort';
import { JobLogModal } from '../../components/JobLogModal';
import { computeProgress, STEP_LABELS } from '../../utils/jobProgress';
import { jobsApi } from '../../api/jobs';
import type { ForecastData, StockAnalysis } from '../../types';
import { EpsChart } from '../../components/EpsChart';
import { TvChart } from '../../components/TvChart';


function consensusColor(consensus: string | null) {
  if (!consensus) return 'gray';
  const c = consensus.toLowerCase();
  if (c.includes('strong buy')) return 'teal';
  if (c.includes('buy')) return 'green';
  if (c.includes('strong sell')) return 'red';
  if (c.includes('sell')) return 'orange';
  return 'gray';
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function BasicInfoPanel({ analysis, symbol }: { analysis: StockAnalysis; symbol: string }) {
  const { basic_info, forecast } = analysis;
  const f: ForecastData = forecast;
  const total = f.rating_total_analysts ?? 0;

  const ratings = [
    { label: 'Strong Buy', value: f.rating_strong_buy ?? 0, color: 'teal' },
    { label: 'Buy', value: f.rating_buy ?? 0, color: 'green' },
    { label: 'Hold', value: f.rating_hold ?? 0, color: 'yellow' },
    { label: 'Sell', value: f.rating_sell ?? 0, color: 'orange' },
    { label: 'Strong Sell', value: f.rating_strong_sell ?? 0, color: 'red' },
  ];

  const priceMin = f.price_target_min ?? 0;
  const priceMax = f.price_target_max ?? 0;
  const priceAvg = f.price_target_average ?? 0;
  const priceCurrent = f.price_current ?? 0;
  const priceRange = priceMax - priceMin;
  const currentPct = priceRange > 0 ? ((priceCurrent - priceMin) / priceRange) * 100 : 0;
  const avgPct = priceRange > 0 ? ((priceAvg - priceMin) / priceRange) * 100 : 0;

  function labelAlign(pct: number) {
    if (pct < 10) return 'translateX(0)';
    if (pct > 90) return 'translateX(-100%)';
    return 'translateX(-50%)';
  }

  return (
    <ScrollArea style={{ height: '100%' }} p="md">
      <Stack gap="md">
        {/* Basic info */}
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Symbol</Text>
            <Text
              size="xs"
              fw={600}
              ff="monospace"
              component="a"
              href={`https://www.tradingview.com/symbols/${analysis.exchange}-${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              c="blue.4"
              style={{ textDecoration: 'none' }}
            >
              {symbol}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Sector</Text>
            <Text size="xs">{basic_info.sector}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Industry</Text>
            <Text size="xs">{basic_info.industry}</Text>
          </Group>
        </Stack>

        <Divider />

        {/* Consensus */}
        <Group justify="space-between" align="center">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">Consensus</Text>
            <Badge color={consensusColor(f.rating_consensus)} variant="light" size="sm">
              {f.rating_consensus ?? '—'}
            </Badge>
          </Stack>
          <Stack gap={0} align="flex-end">
            <Text size="xs" c="dimmed">{f.rating_analyst_count ?? f.price_target_analyst_count} analysts</Text>
            <Text size="xs" c="dimmed">{f.rating_total_analysts} ratings</Text>
          </Stack>
        </Group>

        {/* Ratings bar */}
        {total > 0 && (
          <Stack gap={4}>
            <Group gap={2} style={{ borderRadius: 4, overflow: 'hidden' }}>
              {ratings.map((r) => r.value > 0 && (
                <Tooltip key={r.label} label={`${r.label}: ${r.value}`}>
                  <Box
                    style={{
                      flex: r.value,
                      height: 8,
                      background: `var(--mantine-color-${r.color}-6)`,
                    }}
                  />
                </Tooltip>
              ))}
            </Group>
            <Group justify="space-between">
              {ratings.map((r) => r.value > 0 && (
                <Text key={r.label} size="xs" c="dimmed">{r.value}</Text>
              ))}
            </Group>
          </Stack>
        )}

        <Divider />

        {/* Price target */}
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={500}>Price Target</Text>
            <Text size="xs" c="teal">${fmt(priceAvg)} (↑{fmt(f.price_target_average_upside_pct)}%)</Text>
          </Group>
          {/* Range bar */}
          <Box style={{ position: 'relative', height: 6, background: 'var(--mantine-color-dark-4)', borderRadius: 3, marginTop: 16, overflow: 'visible' }}>
            {/* Current price marker + label */}
            <Box style={{
              position: 'absolute',
              left: `${Math.min(Math.max(currentPct, 0), 100)}%`,
              transform: 'translateX(-50%)',
            }}>
              <Text size="xs" c="dimmed" title={`Current price: $${fmt(priceCurrent)}`} style={{ position: 'absolute', bottom: 10, whiteSpace: 'nowrap', transform: labelAlign(currentPct) }}>
                ${fmt(priceCurrent)}
              </Text>
              <Box style={{ width: 2, height: 10, background: 'var(--mantine-color-gray-4)', borderRadius: 1, marginTop: -2 }} />
            </Box>
            {/* Avg target marker + label */}
            <Box style={{
              position: 'absolute',
              left: `${Math.min(Math.max(avgPct, 0), 100)}%`,
              transform: 'translateX(-50%)',
            }}>
              <Text size="xs" c="teal" title={`Avg price target: $${fmt(priceAvg)}`} style={{ position: 'absolute', bottom: 10, whiteSpace: 'nowrap', transform: labelAlign(avgPct) }}>
                ${fmt(priceAvg)}
              </Text>
              <Box style={{ width: 2, height: 10, background: 'var(--mantine-color-teal-4)', borderRadius: 1, marginTop: -2 }} />
            </Box>
          </Box>
          <Group justify="space-between">
            <Text size="xs" c="dimmed" title={`Min price target: $${fmt(priceMin)}`}>${fmt(priceMin)}</Text>
            <Text size="xs" c="dimmed" title={`Max price target: $${fmt(priceMax)}`}>${fmt(priceMax)}</Text>
          </Group>
        </Stack>


        {basic_info.description && (
          <>
            <Divider />
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>{basic_info.description}</Text>
          </>
        )}
      </Stack>
    </ScrollArea>
  );
}

export function Stock() {
  const { watchlistId, symbol } = useParams<{ watchlistId: string; symbol: string }>();
  const navigate = useNavigate();
  const job = useAppStore((s) => s.jobsByWatchlist[Number(watchlistId)]?.[symbol ?? '']);
  const stepAvgMs = useAppStore((s) => s.stepAvgMs);
  const updateStockScore = useAppStore((s) => s.updateStockScore);
  const stocksByWatchlist = useAppStore((s) => s.stocksByWatchlist);
  const navSort = useAppStore((s) => s.navSort);
  const expandedWatchlistIds = useAppStore((s) => s.expandedWatchlistIds);
  const toggleWatchlistExpanded = useAppStore((s) => s.toggleWatchlistExpanded);
  const [logOpen, setLogOpen] = useState(false);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [scoreJson, setScoreJson] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  const currentKey = watchlistId && symbol ? `${watchlistId}/${symbol}` : null;
  const loading = currentKey !== null && loadedForKey !== currentKey;
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const isActive = job?.status === 'pending' || job?.status === 'running';
  const isFailed = job?.status === 'failed';

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!watchlistId || !symbol) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const wid = Number(watchlistId);
      const sorted = sortNavStocks(stocksByWatchlist[wid] ?? [], navSort);
      const idx = sorted.findIndex((s) => s.symbol === symbol);

      if (e.key === 'ArrowDown') {
        if (idx < sorted.length - 1) navigate(`/stock/${wid}/${sorted[idx + 1].symbol}`);
      } else if (e.key === 'ArrowUp') {
        if (idx > 0) navigate(`/stock/${wid}/${sorted[idx - 1].symbol}`);
      } else if (e.key === 'ArrowLeft') {
        if (expandedWatchlistIds[wid]) toggleWatchlistExpanded(wid);
      } else if (e.key === 'ArrowRight') {
        if (!expandedWatchlistIds[wid]) toggleWatchlistExpanded(wid);
      } else {
        return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [watchlistId, symbol, stocksByWatchlist, navSort, expandedWatchlistIds, toggleWatchlistExpanded, navigate]);

  useEffect(() => {
    if (!watchlistId || !symbol) return;
    const key = `${watchlistId}/${symbol}`;
    setScoreError(null);
    setPrompt(null);
    jobsApi.getAnalysis(Number(watchlistId), symbol)
      .then((data) => {
        setAnalysis(data);
        setScoreJson(data.score ? JSON.stringify(data.score, null, 2) : '');
        setLoadedForKey(key);
      })
      .catch(() => { setAnalysis(null); setLoadedForKey(key); });
  }, [watchlistId, symbol]);

  const prevJobStatus = useRef(job?.status);
  useEffect(() => {
    if (prevJobStatus.current !== 'completed' && job?.status === 'completed') {
      if (watchlistId && symbol) {
        jobsApi.getAnalysis(Number(watchlistId), symbol).then((data) => {
          setAnalysis(data);
          setScoreJson(data.score ? JSON.stringify(data.score, null, 2) : '');
        }).catch(() => {});
      }
    }
    prevJobStatus.current = job?.status;
  }, [job?.status, watchlistId, symbol]);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {(isActive || isFailed) && (
        <Box style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--mantine-color-dark-7)',
          borderBottom: `1px solid var(--mantine-color-${isFailed ? 'red' : 'blue'}-7)`,
        }}>
          {!isFailed && (() => {
            const { value } = job.status === 'pending' ? { value: 0 } : computeProgress(job.step, stepAvgMs);
            return <Progress value={value} animated={value === 0} size={2} color="blue.4" radius={0} />;
          })()}
          <Group px="md" py={4} justify="space-between">
            <Text size="xs" c={isFailed ? 'red.3' : 'blue.3'}>
              {isFailed ? `Failed — ${job.error ?? 'unknown error'}` : job.status === 'pending' ? 'Queued' : (STEP_LABELS[job.step] ?? job.step)}
            </Text>
            <Tooltip label="View logs" position="left">
              <ActionIcon variant="subtle" color={isFailed ? 'red' : 'blue'} size="xs" onClick={() => setLogOpen(true)}>
                <IconList size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      )}

      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box style={{ flex: 3, height: 500, minWidth: 0, overflow: 'hidden' }}>
          {(analysis || isActive) && <TvChart exchange={analysis?.exchange} symbol={symbol!} />}
        </Box>
        <Box style={{ flex: 1, borderLeft: '1px solid var(--mantine-color-dark-4)', height: 500 }}>
          {loading && <Center style={{ height: '100%' }}><Loader size="sm" /></Center>}
          {!loading && !analysis && <Center style={{ height: '100%' }}><Text c="dimmed" size="sm">No analysis data yet.</Text></Center>}
          {!loading && analysis && <BasicInfoPanel analysis={analysis} symbol={symbol!} />}
        </Box>
      </Box>

      {!loading && analysis && (
        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--mantine-color-dark-4)' }}>
          <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <EpsChart title="EPS Quarterly" entries={analysis.earnings.quarterly_earnings} valueKey="eps" />
          </Box>
          <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <EpsChart title="EPS Annual" entries={analysis.earnings.annual_earnings} valueKey="eps" />
          </Box>
          <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <EpsChart title="Revenue Quarterly" entries={analysis.earnings.quarterly_earnings} valueKey="revenue" />
          </Box>
          <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <EpsChart title="Revenue Annual" entries={analysis.earnings.annual_earnings} valueKey="revenue" />
          </Box>
        </Box>
      )}

      {!loading && analysis && (
        <Accordion variant="separated" mt="xs">
          <Accordion.Item value="score">
            <Accordion.Control py={4} px="xs">
              <Text size="xs" c="dimmed">
                {analysis.score ? `Score: ${analysis.score.score.toFixed(1)}` : 'Score: No score available'}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <textarea
                  value={scoreJson}
                  onChange={(e) => { setScoreJson(e.target.value); setScoreError(null); }}
                  rows={12}
                  style={{
                    width: '100%',
                    background: 'var(--mantine-color-dark-8)',
                    color: 'var(--mantine-color-gray-3)',
                    border: `1px solid var(--mantine-color-${scoreError ? 'red-7' : 'dark-4'})`,
                    borderRadius: 4,
                    padding: '8px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    resize: 'vertical',
                  }}
                  placeholder='{"score": 7.5, "criteria": {}, "last_updated": "2024-01-01T00:00:00"}'
                  spellCheck={false}
                />
                {scoreError && <Text size="xs" c="red">{scoreError}</Text>}
                <Group justify="flex-end">
                  <button
                    disabled={scoreSaving}
                    style={{
                      background: 'var(--mantine-color-blue-7)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 12px',
                      fontSize: 12,
                      cursor: scoreSaving ? 'not-allowed' : 'pointer',
                      opacity: scoreSaving ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      if (!watchlistId || !symbol) return;
                      let parsed;
                      try {
                        parsed = JSON.parse(scoreJson);
                      } catch {
                        setScoreError('Invalid JSON');
                        return;
                      }
                      setScoreSaving(true);
                      try {
                        await jobsApi.saveScore(Number(watchlistId), symbol, parsed);
                        const updated = await jobsApi.getAnalysis(Number(watchlistId), symbol);
                        setAnalysis(updated);
                        setScoreJson(updated.score ? JSON.stringify(updated.score, null, 2) : '');
                        if (updated.score) updateStockScore(Number(watchlistId), symbol, updated.score.score);
                        setScoreError(null);
                      } catch (e) {
                        setScoreError(e instanceof Error ? e.message : 'Save failed');
                      } finally {
                        setScoreSaving(false);
                      }
                    }}
                  >
                    {scoreSaving ? 'Saving…' : 'Save'}
                  </button>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="prompt">
            <Box style={{ position: 'relative' }}>
              <Accordion.Control
                py={4}
                px="xs"
                onClick={() => {
                  if (!prompt && !promptLoading && watchlistId && symbol) {
                    setPromptLoading(true);
                    jobsApi.getPrompt(Number(watchlistId), symbol)
                      .then((p) => setPrompt(p))
                      .catch(() => setPrompt('Failed to load prompt.'))
                      .finally(() => setPromptLoading(false));
                  }
                }}
              >
                <Text size="xs" c="dimmed">LLM Prompt</Text>
              </Accordion.Control>
              <Tooltip label={promptCopied ? 'Copied!' : 'Copy prompt'} position="left">
                <ActionIcon
                  variant="subtle"
                  color={promptCopied ? 'teal' : 'gray'}
                  size="xs"
                  style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)' }}
                  onClick={() => {
                    if (!prompt) return;
                    navigator.clipboard.writeText(prompt);
                    setPromptCopied(true);
                    setTimeout(() => setPromptCopied(false), 2000);
                  }}
                >
                  {promptCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </ActionIcon>
              </Tooltip>
            </Box>
            <Accordion.Panel>
              {promptLoading ? (
                <Text size="xs" c="dimmed">Loading…</Text>
              ) : (
                <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>
                  {prompt ?? ''}
                </Code>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      <JobLogModal
        jobId={logOpen && job ? job.job_id : null}
        symbol={symbol ?? ''}
        onClose={() => setLogOpen(false)}
      />
    </Box>
  );
}
