import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Accordion, ActionIcon, Badge, Box, Center, Code, Divider, Group, Loader, Progress, ScrollArea, Stack, Tabs, Text, Tooltip } from '@mantine/core';
import { IconList, IconCopy, IconSelectAll } from '@tabler/icons-react';
import { NotesTab } from '../../components/NotesTab';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { sortNavStocks } from '../../utils/navSort';
import { JobLogModal } from '../../components/JobLogModal';
import { AnimatedTime } from '../../components/AnimatedTime';
import { computeProgress, STEP_LABELS } from '../../utils/jobProgress';
import { jobsApi } from '../../api/jobs';
import type { StockAnalysis } from '../../types';
import { FinancialBarChart, YoyGrowthChart } from '../../components/FinancialChart';
import { TvChart } from '../../components/TvChart';
import { notifyError, notifySuccess } from '../../utils/notify';

const STEP_TO_SECTION: Partial<Record<string, string>> = {
  earnings: 'basic_info',
  forecast: 'earnings',
  document: 'forecast',
  score_queued: 'document',
};

async function copyToClipboard(text: string, label: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error('Clipboard API unavailable');
    }
    notifySuccess(`${label} copied`);
  } catch {
    // Fallback for Firefox and other browsers that block the Clipboard API.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('execCommand copy returned false');
      notifySuccess(`${label} copied`);
    } catch (fallbackErr) {
      console.error('Copy failed:', fallbackErr);
      notifyError(`Failed to copy ${label.toLowerCase()}`);
    }
  }
}


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

  const total = forecast?.rating_total_analysts ?? 0;
  const ratings = forecast ? [
    { label: 'Strong Buy', value: forecast.rating_strong_buy ?? 0, color: 'teal' },
    { label: 'Buy', value: forecast.rating_buy ?? 0, color: 'green' },
    { label: 'Hold', value: forecast.rating_hold ?? 0, color: 'yellow' },
    { label: 'Sell', value: forecast.rating_sell ?? 0, color: 'orange' },
    { label: 'Strong Sell', value: forecast.rating_strong_sell ?? 0, color: 'red' },
  ] : [];

  const priceMin = forecast?.price_target_min ?? 0;
  const priceMax = forecast?.price_target_max ?? 0;
  const priceAvg = forecast?.price_target_average ?? 0;
  const priceCurrent = forecast?.price_current ?? 0;
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

        {forecast ? (
          <>
            {/* Consensus */}
            <Group justify="space-between" align="center">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Consensus</Text>
                <Badge color={consensusColor(forecast.rating_consensus)} variant="light" size="sm">
                  {forecast.rating_consensus ?? '—'}
                </Badge>
              </Stack>
              <Stack gap={0} align="flex-end">
                <Text size="xs" c="dimmed">{forecast.price_target_analyst_count} analysts</Text>
                <Text size="xs" c="dimmed">{forecast.rating_total_analysts} ratings</Text>
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
                <Box style={{ display: 'flex', gap: 2 }}>
                  {ratings.map((r) => r.value > 0 && (
                    <Text key={r.label} size="xs" c="dimmed" style={{ flex: r.value, textAlign: 'center' }}>{r.value}</Text>
                  ))}
                </Box>
              </Stack>
            )}

            <Divider />

            {/* Price target */}
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={500}>Price Target</Text>
                <Text size="xs" c="teal">${fmt(priceAvg)} (↑{fmt(forecast.price_target_average_upside_pct)}%)</Text>
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
          </>
        ) : (
          <Text size="xs" c="dimmed">No forecast data available</Text>
        )}

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

// ─── Score / Prompt sub-components (shared between split and stacked layouts) ─

interface ScoreEditorProps {
  scoreJson: string;
  setScoreJson: (v: string) => void;
  scoreError: string | null;
  setScoreError: (v: string | null) => void;
  scoreSaving: boolean;
  setScoreSaving: (v: boolean) => void;
  scoreTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  watchlistId: string | undefined;
  symbol: string | undefined;
  setAnalysis: (a: StockAnalysis) => void;
  updateStockScore: (wid: number, symbol: string, score: number) => void;
}

function ScoreEditor({ scoreJson, setScoreJson, scoreError, setScoreError, scoreSaving, setScoreSaving, scoreTextareaRef, watchlistId, symbol, setAnalysis, updateStockScore }: ScoreEditorProps) {
  return (
    <Stack gap="xs">
      <textarea
        ref={scoreTextareaRef}
        value={scoreJson}
        onChange={(e) => { setScoreJson(e.target.value); setScoreError(null); }}
        rows={12}
        style={{
          width: '100%',
          background: 'var(--mantine-color-dark-8)',
          color: 'var(--mantine-color-gray-3)',
          border: `1px solid var(--mantine-color-${scoreError ? 'red-7' : 'dark-4'})`,
          borderRadius: 4, padding: '8px', fontFamily: 'monospace', fontSize: 12, resize: 'vertical',
        }}
        placeholder='{"score": 7.5, "criteria": {}, "last_updated": "2024-01-01T00:00:00"}'
        spellCheck={false}
      />
      {scoreError && <Text size="xs" c="red">{scoreError}</Text>}
      <Group justify="flex-end">
        <button
          disabled={scoreSaving}
          style={{
            background: 'var(--mantine-color-blue-7)', color: '#fff', border: 'none',
            borderRadius: 4, padding: '4px 12px', fontSize: 12,
            cursor: scoreSaving ? 'not-allowed' : 'pointer', opacity: scoreSaving ? 0.6 : 1,
          }}
          onClick={async () => {
            if (!watchlistId || !symbol) return;
            let parsed;
            try { parsed = JSON.parse(scoreJson); } catch { setScoreError('Invalid JSON'); return; }
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
            } finally { setScoreSaving(false); }
          }}
        >
          {scoreSaving ? 'Saving…' : 'Save'}
        </button>
      </Group>
    </Stack>
  );
}

interface PromptControlProps {
  prompt: string | null;
  promptLoading: boolean;
  promptCopyLoading: boolean;
  setPromptLoading: (v: boolean) => void;
  setPrompt: (v: string) => void;
  setPromptCopyLoading: (v: boolean) => void;
  promptCodeRef: React.RefObject<HTMLElement | null>;
  watchlistId: string | undefined;
  symbol: string | undefined;
}

function PromptAccordionControl({ prompt, promptLoading, promptCopyLoading, setPromptLoading, setPrompt, setPromptCopyLoading, promptCodeRef, watchlistId, symbol }: PromptControlProps) {
  return (
    <Box style={{ position: 'relative' }}>
      <Accordion.Control
        py={4} px="xs"
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
      <Tooltip label="Select all" position="left">
        <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)' }}
          onClick={(e) => {
            e.stopPropagation();
            const el = promptCodeRef.current;
            if (!el) return;
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }}>
          <IconSelectAll size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Copy prompt" position="left">
        <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)' }}
          disabled={promptCopyLoading}
          onClick={async (e) => {
            e.stopPropagation();
            if (!watchlistId || !symbol) return;
            let text = prompt;
            if (!text) {
              setPromptCopyLoading(true);
              try {
                text = await jobsApi.getPrompt(Number(watchlistId), symbol);
                setPrompt(text);
              } catch (err) {
                console.error('Failed to fetch prompt:', err);
                notifyError('Failed to fetch prompt');
                setPromptCopyLoading(false);
                return;
              }
              setPromptCopyLoading(false);
            }
            copyToClipboard(text, 'Prompt');
          }}>
          {promptCopyLoading ? <Loader size={10} /> : <IconCopy size={12} />}
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

function PromptPanel({ prompt, promptLoading, promptCodeRef }: { prompt: string | null; promptLoading: boolean; promptCodeRef: React.RefObject<HTMLElement | null> }) {
  return promptLoading
    ? <Text size="xs" c="dimmed">Loading…</Text>
    : <Code ref={promptCodeRef} block fz="xs" style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>{prompt ?? ''}</Code>;
}

export function Stock() {
  const { watchlistId, symbol } = useParams<{ watchlistId: string; symbol: string }>();
  const navigate = useNavigate();
  const job = useAppStore((s) => s.jobsByWatchlist[Number(watchlistId)]?.[symbol ?? '']);
  const stepAvgMs = useAppStore((s) => s.stepAvgMs);
  const updateStockScore = useAppStore((s) => s.updateStockScore);
  const scorePanelLayout = useAppStore((s) => s.scorePanelLayout);
  const stockPageTab = useAppStore((s) => s.stockPageTab);
  const setStockPageTab = useAppStore((s) => s.setStockPageTab);
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
  const [promptCopyLoading, setPromptCopyLoading] = useState(false);
  const scoreTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptCodeRef = useRef<HTMLElement>(null);
  const analysisRef = useRef<typeof analysis>(null);
  useEffect(() => { analysisRef.current = analysis; });
  const prevStep = useRef(job?.step);

  const isActive = job?.status === 'pending' || job?.status === 'running' || job?.status === 'partial_completed';
  const isFailed = job?.status === 'failed';

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (job?.status !== 'running') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job?.status]);

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
    jobsApi.getAnalysis(Number(watchlistId), symbol)
      .then((data) => {
        setScoreError(null);
        setPrompt(null);
        setAnalysis(data);
        setScoreJson(data.score ? JSON.stringify(data.score, null, 2) : '');
        setLoadedForKey(key);
      })
      .catch(() => { setAnalysis(null); setLoadedForKey(key); });
  }, [watchlistId, symbol]);

  useEffect(() => {
    const prev = prevStep.current;
    const curr = job?.step;
    prevStep.current = curr;
    if (!watchlistId || !symbol || !curr || curr === prev) return;
    const section = STEP_TO_SECTION[curr];
    if (!section) return;
    const wid = Number(watchlistId);
    if (!analysisRef.current) {
      jobsApi.getAnalysis(wid, symbol)
        .then((data) => {
          setAnalysis(data);
          setScoreJson(data.score ? JSON.stringify(data.score, null, 2) : '');
          setLoadedForKey(`${watchlistId}/${symbol}`);
        })
        .catch(() => {});
    } else {
      jobsApi.getAnalysisSection(wid, symbol, section)
        .then((data) => setAnalysis((a) => a ? { ...a, ...data } : null))
        .catch(() => {});
    }
  }, [job?.step, watchlistId, symbol]);

  const prevJobStatus = useRef(job?.status);
  useEffect(() => {
    if (prevJobStatus.current !== 'completed' && job?.status === 'completed') {
      if (watchlistId && symbol) {
        const wid = Number(watchlistId);
        jobsApi.getAnalysisSection(wid, symbol, 'score')
          .then((data) => {
            setAnalysis((a) => a ? { ...a, ...data } : null);
            if (data.score) {
              setScoreJson(JSON.stringify(data.score, null, 2));
              updateStockScore(wid, symbol, data.score.score);
            }
          })
          .catch(() => {});
      }
    }
    prevJobStatus.current = job?.status;
  }, [job?.status, watchlistId, symbol, updateStockScore]);

  return (
    <Box style={{ height: 'calc(100dvh - var(--app-shell-header-height) - var(--app-shell-padding))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {(isActive || isFailed) && (
        <Box style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--mantine-color-dark-7)',
          borderBottom: `1px solid var(--mantine-color-${isFailed ? 'red' : 'blue'}-7)`,
        }}>
          {!isFailed && (() => {
            const { value } = job.status === 'pending'
              ? { value: 0 }
              : computeProgress(job.phase_started_at, job.accumulated_ms, stepAvgMs, nowMs);
            return <Progress value={value} animated={value === 0} size={2} color="blue.4" radius={0} />;
          })()}
          <Group px="md" py={4} justify="space-between">
            <Text size="xs" c={isFailed ? 'red.3' : 'blue.3'}>
              {isFailed ? `Failed — ${job.error ?? 'unknown error'}` : job.status === 'pending' ? 'Queued' : (STEP_LABELS[job.step] ?? job.step)}
            </Text>
            {!isFailed && job.status !== 'pending' && (() => {
              const { elapsed, expected } = computeProgress(job.phase_started_at, job.accumulated_ms, stepAvgMs, nowMs);
              return (
                <Text size="xs" c="blue.3">
                  <AnimatedTime time={elapsed} />{expected && ` / ${expected}`}
                </Text>
              );
            })()}
            <Tooltip label="View logs" position="left">
              <ActionIcon variant="subtle" color={isFailed ? 'red' : 'blue'} size="xs" onClick={() => setLogOpen(true)}>
                <IconList size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      )}

      <Box style={{ display: 'flex', flexShrink: 0 }}>
        <Box style={{ flex: 3, height: 550, minWidth: 0, overflow: 'hidden' }}>
          {(analysis || isActive) && <TvChart exchange={analysis?.exchange} symbol={symbol!} />}
        </Box>
        <Box style={{ flex: 1, borderLeft: '1px solid var(--mantine-color-dark-4)', height: 550 }}>
          {loading && <Center style={{ height: '100%' }}><Loader size="sm" /></Center>}
          {!loading && !analysis && <Center style={{ height: '100%' }}><Text c="dimmed" size="sm">No analysis data yet.</Text></Center>}
          {!loading && analysis && <BasicInfoPanel analysis={analysis} symbol={symbol!} />}
        </Box>
      </Box>

      {/* ── Tabs: Charts / Score / Notes ── */}
      <Tabs
        value={stockPageTab}
        onChange={(v) => v && setStockPageTab(v as 'charts' | 'score' | 'notes')}
        styles={{
          root: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
          list: {
            borderBottom: '1px solid var(--mantine-color-dark-4)',
            background: 'var(--mantine-color-dark-8)',
            gap: 0,
            flexShrink: 0,
          },
          tab: {
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '6px 16px',
            borderRadius: 0,
          },
          panel: { flex: 1, minHeight: 0 },
        }}
      >
        <Tabs.List>
          {(['charts', 'score', 'notes'] as const).map((t) => (
            <Tabs.Tab
              key={t}
              value={t}
              style={{
                color: stockPageTab === t ? '#f59e0b' : 'var(--mantine-color-dark-2)',
                borderBottom: `1px solid ${stockPageTab === t ? '#f59e0b' : 'transparent'}`,
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {/* Charts */}
        <Tabs.Panel value="charts">
          {!loading && analysis && (
            <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--mantine-color-dark-4)' }}>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <YoyGrowthChart title="EPS Quarterly YoY Growth" entries={analysis.earnings.quarterly_earnings} valueKey="eps" />
              </Box>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <YoyGrowthChart title="Revenue Quarterly YoY Growth" entries={analysis.earnings.quarterly_earnings} valueKey="revenue" />
              </Box>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <FinancialBarChart title="EPS Quarterly" entries={analysis.earnings.quarterly_earnings} valueKey="eps" />
              </Box>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <FinancialBarChart title="Revenue Quarterly" entries={analysis.earnings.quarterly_earnings} valueKey="revenue" />
              </Box>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <FinancialBarChart title="EPS Annual" entries={analysis.earnings.annual_earnings} valueKey="eps" />
              </Box>
              <Box p="xs" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <FinancialBarChart title="Revenue Annual" entries={analysis.earnings.annual_earnings} valueKey="revenue" />
              </Box>
            </Box>
          )}
        </Tabs.Panel>

        {/* Score */}
        <Tabs.Panel value="score" p="xs">
          {!loading && analysis && scorePanelLayout === 'split' && (
            <Box style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Accordion variant="separated" defaultValue="score">
                  <Accordion.Item value="score">
                    <Box style={{ position: 'relative' }}>
                      <Accordion.Control py={4} px="xs">
                        <Text size="xs" c="dimmed">
                          {analysis.score ? `Score: ${analysis.score.score.toFixed(1)}` : 'Score: No score available'}
                        </Text>
                      </Accordion.Control>
                      <Tooltip label="Select all" position="left">
                        <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => { e.stopPropagation(); scoreTextareaRef.current?.select(); }}>
                          <IconSelectAll size={12} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Copy" position="left">
                        <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => { e.stopPropagation(); copyToClipboard(scoreJson, 'Score'); }}>
                          <IconCopy size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Box>
                    <Accordion.Panel>
                      <ScoreEditor scoreJson={scoreJson} setScoreJson={setScoreJson} scoreError={scoreError} setScoreError={setScoreError} scoreSaving={scoreSaving} setScoreSaving={setScoreSaving} scoreTextareaRef={scoreTextareaRef} watchlistId={watchlistId} symbol={symbol} setAnalysis={setAnalysis} updateStockScore={updateStockScore} />
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Box>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Accordion variant="separated" defaultValue="prompt">
                  <Accordion.Item value="prompt">
                    <PromptAccordionControl prompt={prompt} promptLoading={promptLoading} promptCopyLoading={promptCopyLoading} setPromptLoading={setPromptLoading} setPrompt={setPrompt} setPromptCopyLoading={setPromptCopyLoading} promptCodeRef={promptCodeRef} watchlistId={watchlistId} symbol={symbol} />
                    <Accordion.Panel>
                      <PromptPanel prompt={prompt} promptLoading={promptLoading} promptCodeRef={promptCodeRef} />
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Box>
            </Box>
          )}
          {!loading && analysis && scorePanelLayout === 'stacked' && (
            <Accordion variant="separated" multiple defaultValue={['score', 'prompt']}>
              <Accordion.Item value="score">
                <Box style={{ position: 'relative' }}>
                  <Accordion.Control py={4} px="xs">
                    <Text size="xs" c="dimmed">
                      {analysis.score ? `Score: ${analysis.score.score.toFixed(1)}` : 'Score: No score available'}
                    </Text>
                  </Accordion.Control>
                  <Tooltip label="Select all" position="left">
                    <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => { e.stopPropagation(); scoreTextareaRef.current?.select(); }}>
                      <IconSelectAll size={12} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Copy" position="left">
                    <ActionIcon variant="subtle" color="gray" size="xs" style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => { e.stopPropagation(); copyToClipboard(scoreJson, 'Score'); }}>
                      <IconCopy size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Box>
                <Accordion.Panel>
                  <ScoreEditor scoreJson={scoreJson} setScoreJson={setScoreJson} scoreError={scoreError} setScoreError={setScoreError} scoreSaving={scoreSaving} setScoreSaving={setScoreSaving} scoreTextareaRef={scoreTextareaRef} watchlistId={watchlistId} symbol={symbol} setAnalysis={setAnalysis} updateStockScore={updateStockScore} />
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="prompt">
                <PromptAccordionControl prompt={prompt} promptLoading={promptLoading} promptCopyLoading={promptCopyLoading} setPromptLoading={setPromptLoading} setPrompt={setPrompt} setPromptCopyLoading={setPromptCopyLoading} promptCodeRef={promptCodeRef} watchlistId={watchlistId} symbol={symbol} />
                <Accordion.Panel>
                  <PromptPanel prompt={prompt} promptLoading={promptLoading} promptCodeRef={promptCodeRef} />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
        </Tabs.Panel>

        {/* Notes */}
        <Tabs.Panel value="notes" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <NotesTab symbol={symbol!} />
        </Tabs.Panel>
      </Tabs>

      <JobLogModal
        jobId={logOpen && job ? job.job_id : null}
        symbol={symbol ?? ''}
        onClose={() => setLogOpen(false)}
      />
    </Box>
  );
}
