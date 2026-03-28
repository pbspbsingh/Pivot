import { Text, Title } from '@mantine/core';

export function Home() {
  return (
    <>
      <Title order={2} mb="md">Watchlists</Title>
      <Text c="dimmed">No watchlists yet.</Text>
    </>
  );
}
