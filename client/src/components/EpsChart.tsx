import { useEffect, useRef } from 'react';
import { Box, Text } from '@mantine/core';
import {
  createChart,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import type { EarningsEntry } from '../types';

interface Props {
  title: string;
  entries: EarningsEntry[];
  valueKey: 'eps' | 'revenue';
}

function toTime(label: string): Time {
  // "Q1 '24" → "2024-01-01", "Q2 '24" → "2024-04-01", etc.
  const qMatch = label.match(/Q(\d)\s+'(\d{2})/);
  if (qMatch) {
    const quarter = parseInt(qMatch[1]);
    const year = 2000 + parseInt(qMatch[2]);
    const month = (quarter - 1) * 3 + 1;
    return `${year}-${String(month).padStart(2, '0')}-01` as Time;
  }
  // "2024" → "2024-01-01"
  const yearMatch = label.match(/^(\d{4})$/);
  if (yearMatch) return `${yearMatch[1]}-01-01` as Time;
  return label as Time;
}

function formatRevenue(v: number) {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(2)}`;
}

function fmtVal(v: number, key: 'eps' | 'revenue') {
  return key === 'eps' ? `$${v.toFixed(2)}` : formatRevenue(v);
}

export function EpsChart({ title, entries, valueKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const reportedRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const estimateRef = useRef<ISeriesApi<'Line'> | null>(null);
  const growthRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#2d2d2d' },
        horzLines: { color: '#2d2d2d' },
      },
      rightPriceScale: { borderColor: '#3d3d3d' },
      leftPriceScale: { visible: true, borderColor: '#3d3d3d' },
      timeScale: { borderColor: '#3d3d3d', fixLeftEdge: true, fixRightEdge: true },
      autoSize: true,
    });
    chartRef.current = chart;

    reportedRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'right',
      priceFormat: { type: 'custom', formatter: (v: number) => fmtVal(v, valueKey) },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    estimateRef.current = chart.addSeries(LineSeries, {
      color: '#cbd5e1',
      lineWidth: 1,
      lineStyle: 2,
      priceScaleId: 'right',
      priceFormat: { type: 'custom', formatter: (v: number) => fmtVal(v, valueKey) },
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    growthRef.current = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceScaleId: 'left',
      priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(1)}%` },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    return () => { chart.remove(); };
  }, [valueKey]);

  useEffect(() => {
    if (!reportedRef.current || !estimateRef.current || !growthRef.current) return;

    const reportedKey = valueKey === 'eps' ? 'eps_reported' : 'revenue_reported';
    const estimateKey = valueKey === 'eps' ? 'eps_estimate' : 'revenue_estimate';

    const reported: { time: Time; value: number; color: string }[] = [];
    const estimate: { time: Time; value: number }[] = [];
    const growth: { time: Time; value: number }[] = [];

    entries.forEach((e, i) => {
      const time = toTime(e.period_label);
      const rep = e[reportedKey as keyof EarningsEntry] as number | null;
      const est = e[estimateKey as keyof EarningsEntry] as number | null;

      if (rep != null) {
        const beat = est != null ? rep >= est : true;
        reported.push({ time, value: rep, color: beat ? '#22c55e' : '#ef4444' });
      } else if (est != null) {
        reported.push({ time, value: est, color: '#3b82f6' });
      }

      if (est != null) estimate.push({ time, value: est });

      const prevRep = i > 0 ? (entries[i - 1][reportedKey as keyof EarningsEntry] as number | null) : null;
      if (rep != null && prevRep != null && prevRep !== 0) {
        growth.push({ time, value: ((rep - prevRep) / Math.abs(prevRep)) * 100 });
      }
    });

    reportedRef.current.setData(reported);
    estimateRef.current.setData(estimate);
    growthRef.current.setData(growth);
    chartRef.current?.timeScale().fitContent();
  }, [entries, valueKey]);

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={500} mb={4}>{title}</Text>
      <div ref={containerRef} style={{ height: 200, marginTop: 8, width: '100%' }} />
    </Box>
  );
}
