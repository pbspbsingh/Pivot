import { useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { api, type Prompt } from '../../api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { useAppStore } from '../../store';

const PROMPT_LABELS: Record<string, string> = {
  vcp_quantitative: 'VCP — Quantitative',
  vcp_qualitative: 'VCP — Qualitative',
  ep_quantitative: 'EP — Quantitative',
  ep_qualitative: 'EP — Qualitative',
};

const PROMPT_ROWS = [
  ['vcp_quantitative', 'vcp_qualitative'],
  ['ep_quantitative', 'ep_qualitative'],
];

export function Settings() {
  const tabOrientation = useAppStore((s) => s.tabOrientation);
  const setTabOrientation = useAppStore((s) => s.setTabOrientation);

  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.prompts.list().then((rows: Prompt[]) => {
      const map: Record<string, string> = {};
      for (const p of rows) map[p.key] = p.content;
      setPrompts(map);
    }).catch((e: Error) => notifyError(e.message));
  }, []);

  async function save(key: string) {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.prompts.update(key, prompts[key] ?? '');
      notifySuccess(`${PROMPT_LABELS[key]} saved`);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <Stack gap="xl" w="100%">
      <Title order={2}>Settings</Title>

      <Group justify="space-between" maw={480}>
        <Text fw={500}>Watchlist Tab Layout</Text>
        <SegmentedControl
          value={tabOrientation}
          onChange={(v) => setTabOrientation(v as 'vertical' | 'horizontal')}
          data={[
            { label: 'Vertical', value: 'vertical' },
            { label: 'Top', value: 'horizontal' },
          ]}
        />
      </Group>

      <Divider />

      <Stack gap="lg">
        <Title order={4}>Scoring Prompts</Title>
        {PROMPT_ROWS.map((row) => (
          <SimpleGrid key={row[0]} cols={{ base: 1, md: 2 }} spacing="md">
            {row.map((key) => (
              <Stack key={key} gap="xs">
                <Text fw={500} size="sm">{PROMPT_LABELS[key]}</Text>
                <Textarea
                  value={prompts[key] ?? ''}
                  onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.currentTarget.value }))}
                  autosize
                  minRows={6}
                  maxRows={20}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Group justify="flex-end">
                  <Button size="xs" loading={saving[key]} onClick={() => save(key)}>
                    Save
                  </Button>
                </Group>
              </Stack>
            ))}
          </SimpleGrid>
        ))}
      </Stack>
    </Stack>
  );
}
