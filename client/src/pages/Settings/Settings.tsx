import { Group, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useAppStore } from '../../store';

export function Settings() {
  const tabOrientation = useAppStore((s) => s.tabOrientation);
  const setTabOrientation = useAppStore((s) => s.setTabOrientation);

  return (
    <Stack gap="xl" maw={480}>
      <Title order={2}>Settings</Title>

      <Group justify="space-between">
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
    </Stack>
  );
}
