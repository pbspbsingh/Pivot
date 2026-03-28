import { Title } from '@mantine/core';
import { useParams } from 'react-router-dom';

export function Stock() {
  const { id } = useParams<{ id: string }>();

  return (
    <Title order={2}>{id}</Title>
  );
}
