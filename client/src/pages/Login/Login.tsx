import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Center, Loader, Paper, PasswordInput, Stack, Text } from '@mantine/core';
import { login } from '../../api';
import logo from '../../assets/logo.svg';

export function Login() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then((res) => { if (res.ok) navigate('/', { replace: true }); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return <Center h="100vh"><Loader size="sm" /></Center>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(token);
      navigate('/', { replace: true });
    } catch {
      setError('Invalid token');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center h="100vh">
      <Paper p="xl" w={360} withBorder>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <img src={logo} style={{ height: 32 }} alt="Pivot" />
            <PasswordInput
              label="Token"
              placeholder="Paste your auth token"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              autoFocus
            />
            {error && <Text c="red" size="sm">{error}</Text>}
            <Button type="submit" loading={loading} fullWidth>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
