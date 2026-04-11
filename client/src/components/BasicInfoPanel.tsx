import { Badge, Box, Divider, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import type { StockAnalysis } from '../types/index';
import { consensusColor, fmt } from '../utils/helpers';

export function BasicInfoPanel({ analysis, symbol }: { analysis: StockAnalysis; symbol: string }) {
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
