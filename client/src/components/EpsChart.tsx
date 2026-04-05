import { Box, Text } from '@mantine/core';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { EarningsEntry } from '../types';

interface Props {
  title: string;
  entries: EarningsEntry[];
  valueKey: 'eps' | 'revenue';
}

function formatValue(v: number, key: 'eps' | 'revenue') {
  if (key === 'eps') return `$${v.toFixed(2)}`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(2)}`;
}

function formatAxis(v: number, key: 'eps' | 'revenue') {
  if (key === 'eps') return `$${v.toFixed(1)}`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

interface TooltipEntry {
  label: string;
  reported?: number;
  estimate?: number;
  beat: boolean | null;
  growth?: number;
  surprise?: number;
}

function CustomTooltip({ active, payload, label, valueKey }: {
  active?: boolean;
  payload?: { payload: TooltipEntry }[];
  label?: string;
  valueKey: 'eps' | 'revenue';
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  const row = (l: string, val: string, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: '#9ca3af' }}>{l}</span>
      <span style={{ color: color ?? '#e5e7eb', fontWeight: 500 }}>{val}</span>
    </div>
  );

  const signColor = (v: number) => v >= 0 ? '#22c55e' : '#ef4444';
  const signStr = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', borderRadius: 4, padding: '6px 10px', fontSize: 11, minWidth: 160 }}>
      <div style={{ color: '#e5e7eb', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {d.growth != null && row('Growth', signStr(d.growth), signColor(d.growth))}
      {d.surprise != null && row('Surprise', signStr(d.surprise), signColor(d.surprise))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#9ca3af' }}>Reported/Est</span>
        <span>
          <span style={{ color: d.beat == null ? '#e5e7eb' : d.beat ? '#22c55e' : '#ef4444', fontWeight: 500 }}>
            {d.reported != null ? formatValue(d.reported, valueKey) : '—'}
          </span>
          <span style={{ color: '#3b82f6', fontWeight: 500 }}>
            {' / '}{d.estimate != null ? formatValue(d.estimate, valueKey) : '—'}
          </span>
        </span>
      </div>
    </div>
  );
}

export function EpsChart({ title, entries, valueKey }: Props) {
  const reportedKey = valueKey === 'eps' ? 'eps_reported' : 'revenue_reported';
  const estimateKey = valueKey === 'eps' ? 'eps_estimate' : 'revenue_estimate';

  const data = entries.map((e, i) => {
    const reported = e[reportedKey as keyof EarningsEntry] as number | null;
    const estimate = e[estimateKey as keyof EarningsEntry] as number | null;
    const prevReported = i > 0 ? (entries[i - 1][reportedKey as keyof EarningsEntry] as number | null) : null;
    const growth =
      reported != null && prevReported != null && prevReported !== 0
        ? ((reported - prevReported) / Math.abs(prevReported)) * 100
        : undefined;
    const surprise =
      reported != null && estimate != null && estimate !== 0
        ? ((reported - estimate) / Math.abs(estimate)) * 100
        : undefined;

    return {
      label: e.period_label,
      reported: reported ?? undefined,
      estimate: estimate ?? undefined,
      beat: reported != null && estimate != null ? reported >= estimate : null,
      growth,
      surprise,
    };
  });

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={500} mb={4}>{title}</Text>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} barCategoryGap="20%" barGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatAxis(v, valueKey)}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            width={55}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fill: '#f59e0b', fontSize: 10 }}
            width={40}
          />
          <Tooltip content={<CustomTooltip valueKey={valueKey} />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
          <Bar yAxisId="left" dataKey="estimate" name="Estimate" fill="#3b82f6" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="#3b82f6" fillOpacity={0.6} />
            ))}
          </Bar>
          <Bar yAxisId="left" dataKey="reported" name="Reported" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.reported == null ? 'transparent' : d.beat ? '#22c55e' : '#ef4444'}
              />
            ))}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="growth"
            name="Growth"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ fill: '#f59e0b', r: 3 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
