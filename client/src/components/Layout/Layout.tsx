import { ActionIcon, AppShell, Burger, Group, NavLink, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router-dom';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { IconHome2, IconSettings } from '@tabler/icons-react';
import { useAppStore } from '../../store';
import { useServerEvents } from '../../hooks/useServerEvents';
import logo from '../../assets/logo.svg';

export function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const connected = useAppStore((s) => s.connected);
  useServerEvents();

  return (
    <AppShell
      header={{ height: 44 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="xs"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <RouterNavLink to="/" style={{ display: 'flex', alignItems: 'center' }}>
              <img
                src={logo}
                alt="Pivot"
                height={32}
                style={{
                  filter: connected ? 'none' : 'grayscale(100%) opacity(0.4)',
                  transition: 'filter 0.4s ease',
                }}
              />
            </RouterNavLink>
          </Group>
          <ActionIcon variant="subtle" color="gray" onClick={() => navigate('/settings')}>
            <IconSettings size={18} />
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={4}>
          <NavLink
            component={RouterNavLink}
            to="/"
            end
            label="Home"
            leftSection={<IconHome2 size={16} />}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
