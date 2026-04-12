import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ActionIcon, Box, Center, Code, Group, Loader, Progress, Stack, Tabs, Text, Tooltip } from '@mantine/core';
import { IconList, IconCopy, IconDeviceFloppy, IconSelectAll } from '@tabler/icons-react';
import { NotesTab } from '../../components/NotesTab';
import { BasicInfoPanel } from '../../components/BasicInfoPanel';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { sortNavStocks } from '../../utils/navSort';
import { JobLogModal } from '../../components/JobLogModal';
import { AnimatedTime } from '../../components/AnimatedTime';
import { computeProgress, STEP_LABELS, STEP_TO_SECTION } from '../../utils/jobProgress';
import { jobsApi } from '../../api/jobs';
import type { StockAnalysis } from '../../types';
import { FinancialBarChart, YoyGrowthChart } from '../../components/FinancialChart';
import { TvChart } from '../../components/TvChart';
import { notifyError } from '../../utils/notify';
import { copyToClipboard } from '../../utils/helpers';

// ─── Score / Prompt sub-components (shared between split and stacked layouts) ─

interface ScoreEditorProps {
  scoreJson: string;
  setScoreJson: (v: string) => void;
  scoreError: string | null;
  setScoreError: (v: string | null) => void;
  scoreTextareaRef: React.RefObject<HTMLTextAreaElement>;
}

function ScoreEditor({ scoreJson, setScoreJson, scoreError, setScoreError, scoreTextareaRef }: ScoreEditorProps) {
  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <textarea
        ref={scoreTextareaRef}
        value={scoreJson}
        onChange={(e) => { setScoreJson(e.target.value); setScoreError(null); }}
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--mantine-color-dark-8)',
          color: 'var(--mantine-color-gray-3)',
          border: `1px solid var(--mantine-color-${scoreError ? 'red-7' : 'dark-4'})`,
          borderRadius: 4, padding: '8px', fontFamily: 'monospace', fontSize: 12, resize: 'none',
          whiteSpace: 'pre', overflowX: 'auto',
        }}
        placeholder='{"score": 7.5, "criteria": {}, "last_updated": "2024-01-01T00:00:00"}'
        spellCheck={false}
      />
      {scoreError && <Text size="xs" c="red">{scoreError}</Text>}
    </Stack>
  );
}


function PromptPanel({ prompt, promptCodeRef }: { prompt: string | null; promptCodeRef: React.RefObject<HTMLElement> }) {
  return prompt === null
    ? <Text size="xs" c="dimmed">Loading…</Text>
    : <Code ref={promptCodeRef} block fz="xs" style={{ whiteSpace: 'pre-wrap', flex: 1, overflow: 'auto', margin: 0, display: 'block' }}>{prompt}</Code>;
}

export function Stock() {
  const { watchlistId, symbol } = useParams<{ watchlistId: string; symbol: string }>();
  const navigate = useNavigate();
  const job = useAppStore((s) => s.jobsByWatchlist[Number(watchlistId)]?.[symbol ?? '']);
  const stepAvgMs = useAppStore((s) => s.stepAvgMs);
  const updateStockScore = useAppStore((s) => s.updateStockScore);
  const stockPageTab = useAppStore((s) => s.stockPageTab);
  const setStockPageTab = useAppStore((s) => s.setStockPageTab);
  const stocksByWatchlist = useAppStore((s) => s.stocksByWatchlist);
  const navSort = useAppStore((s) => s.navSort);
  const expandedWatchlistIds = useAppStore((s) => s.expandedWatchlistIds);
  const toggleWatchlistExpanded = useAppStore((s) => s.toggleWatchlistExpanded);
  const [logOpen, setLogOpen] = useState(false);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [scoreJson, setScoreJson] = useState('');
  const [savedScoreJson, setSavedScoreJson] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);

  async function handleSaveScore() {
    if (!watchlistId || !symbol) return;
    let parsed;
    try { parsed = JSON.parse(scoreJson); } catch { setScoreError('Invalid JSON'); return; }
    setScoreSaving(true);
    try {
      await jobsApi.saveScore(Number(watchlistId), symbol, parsed);
      const updated = await jobsApi.getAnalysis(Number(watchlistId), symbol);
      setAnalysis(updated);
      const savedJson = updated.score ? JSON.stringify(updated.score, null, 2) : '';
      setScoreJson(savedJson);
      setSavedScoreJson(savedJson);
      if (updated.score) updateStockScore(Number(watchlistId), symbol, updated.score.score);
      setScoreError(null);
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : 'Save failed');
    } finally { setScoreSaving(false); }
  }
  const currentKey = watchlistId && symbol ? `${watchlistId}/${symbol}` : null;
  const loading = currentKey !== null && loadedForKey !== currentKey;
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptCopyLoading, setPromptCopyLoading] = useState(false);
  const scoreTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptCodeRef = useRef<HTMLElement>(null);
  const analysisRef = useRef<typeof analysis>(null);
  useEffect(() => { analysisRef.current = analysis; });
  const prevStep = useRef(job?.step);
  const promptFetchedFor = useRef<string | null>(null);

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
    promptFetchedFor.current = null;
    jobsApi.getAnalysis(Number(watchlistId), symbol)
      .then((data) => {
        setScoreError(null);
        setPrompt(null);
        setAnalysis(data);
        const initialJson = data.score ? JSON.stringify(data.score, null, 2) : '';
        setScoreJson(initialJson);
        setSavedScoreJson(initialJson);
        setLoadedForKey(key);
      })
      .catch(() => { setAnalysis(null); setLoadedForKey(key); });
  }, [watchlistId, symbol]);

  // Auto-fetch prompt when score tab is active
  useEffect(() => {
    if (stockPageTab !== 'score' || !watchlistId || !symbol) return;
    const key = `${watchlistId}/${symbol}`;
    if (promptFetchedFor.current === key) return;
    promptFetchedFor.current = key;
    jobsApi.getPrompt(Number(watchlistId), symbol)
      .then(setPrompt)
      .catch(() => setPrompt('Failed to load prompt.'));
  }, [stockPageTab, watchlistId, symbol]);

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
          const j = data.score ? JSON.stringify(data.score, null, 2) : '';
          setScoreJson(j);
          setSavedScoreJson(j);
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
              const j = JSON.stringify(data.score, null, 2);
              setScoreJson(j);
              setSavedScoreJson(j);
              updateStockScore(wid, symbol, data.score.score);
            }
          })
          .catch(() => {});
      }
    }
    prevJobStatus.current = job?.status;
  }, [job?.status, watchlistId, symbol, updateStockScore]);

  return (
    <Box style={{ height: 'calc(100dvh - var(--app-shell-header-height) - var(--app-shell-padding))', display: 'flex', flexDirection: 'column' }}>
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
          root: { display: 'flex', flexDirection: 'column', flex: 1 },
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
          panel: { flex: 1 },
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
        <Tabs.Panel value="score" style={{ height: '100%', display: 'flex' }}>
          {!loading && !analysis && (
            <Center style={{ flex: 1 }}>
              <Text c="dimmed" size="sm">No analysis data yet.</Text>
            </Center>
          )}
          {!loading && analysis && (
            <>
              {/* Score — left 50% */}
              <Box style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--mantine-color-dark-4)', display: 'flex', flexDirection: 'column' }}>
                <Group px="xs" py={6} justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
                  <Text size="xs" c="dimmed">{analysis.score ? `Score: ${analysis.score.score.toFixed(1)}` : 'No score yet'}</Text>
                  <Group gap={4}>
                    <Tooltip label="Save" position="left">
                      <ActionIcon variant="subtle" color={scoreSaving ? 'gray' : 'blue'} size="xs" loading={scoreSaving} disabled={scoreJson === savedScoreJson} onClick={handleSaveScore}>
                        <IconDeviceFloppy size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Select all" position="left">
                      <ActionIcon variant="subtle" color="gray" size="xs" onClick={() => scoreTextareaRef.current?.select()}>
                        <IconSelectAll size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Copy" position="left">
                      <ActionIcon variant="subtle" color="gray" size="xs" onClick={() => copyToClipboard(scoreJson, 'Score')}>
                        <IconCopy size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                <Box p="xs" style={{ flex: 1, overflow: 'auto' }}>
                  <ScoreEditor scoreJson={scoreJson} setScoreJson={setScoreJson} scoreError={scoreError} setScoreError={setScoreError} scoreTextareaRef={scoreTextareaRef} />
                </Box>
              </Box>
              {/* Prompt — right 50% */}
              <Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Group px="xs" py={6} justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
                  <Text size="xs" c="dimmed">LLM Prompt</Text>
                  <Group gap={4}>
                    <Tooltip label="Select all" position="left">
                      <ActionIcon variant="subtle" color="gray" size="xs" onClick={() => { const el = promptCodeRef.current; if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }}>
                        <IconSelectAll size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Copy prompt" position="left">
                      <ActionIcon variant="subtle" color="gray" size="xs" disabled={promptCopyLoading} onClick={async () => { if (!watchlistId || !symbol) return; let text = prompt; if (!text) { setPromptCopyLoading(true); try { text = await jobsApi.getPrompt(Number(watchlistId), symbol); setPrompt(text); } catch { notifyError('Failed to fetch prompt'); setPromptCopyLoading(false); return; } setPromptCopyLoading(false); } copyToClipboard(text, 'Prompt'); }}>
                        {promptCopyLoading ? <Loader size={10} /> : <IconCopy size={12} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                <Box p="xs" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <PromptPanel prompt={prompt} promptCodeRef={promptCodeRef} />
                </Box>
              </Box>
            </>
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
