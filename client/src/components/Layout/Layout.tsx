import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router-dom';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { IconSettings, IconTrash } from '@tabler/icons-react';
import { watchlistApi } from '../../api/watchlists';
import { useAppStore } from '../../store';
import { useServerEvents } from '../../hooks/useServerEvents';
import { AnimatedTime } from '../AnimatedTime';
import { notifyError } from '../../utils/notify';
import logo from '../../assets/logo.svg';

interface TickerMenuTarget {
  watchlistId: number;
  symbol: string;
}

export function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const connected = useAppStore((s) => s.connected);
  const serverTime = useAppStore((s) => s.serverTime);

  const watchlists = useAppStore((s) => s.watchlists);
  const setWatchlists = useAppStore((s) => s.setWatchlists);
  const stocksByWatchlist = useAppStore((s) => s.stocksByWatchlist);
  const setWatchlistStocks = useAppStore((s) => s.setWatchlistStocks);
  const removeWatchlistStock = useAppStore((s) => s.removeWatchlistStock);
  const expandedWatchlistIds = useAppStore((s) => s.expandedWatchlistIds);
  const toggleWatchlistExpanded = useAppStore((s) => s.toggleWatchlistExpanded);

  const [tickerMenu, setTickerMenu] = useState<TickerMenuTarget | null>(null);

  useServerEvents();

  // Fetch watchlists once on mount — Layout is always rendered.
  useEffect(() => {
    watchlistApi.list().then(setWatchlists).catch(() => {});
  }, [setWatchlists]);

  // When watchlists first load, fetch stocks for any already-expanded entries.
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (watchlists.length === 0 || initialFetchDone.current) return;
    initialFetchDone.current = true;
    watchlists
      .filter((w) => expandedWatchlistIds[w.id] && !stocksByWatchlist[w.id])
      .forEach((w) => {
        watchlistApi
          .listStocks(w.id)
          .then((stocks) => setWatchlistStocks(w.id, stocks.map((s) => s.symbol)))
          .catch(() => {});
      });
  }, [watchlists, expandedWatchlistIds, stocksByWatchlist, setWatchlistStocks]);

  async function handleToggle(id: number) {
    toggleWatchlistExpanded(id);
    if (!expandedWatchlistIds[id] && !stocksByWatchlist[id]) {
      try {
        const stocks = await watchlistApi.listStocks(id);
        setWatchlistStocks(id, stocks.map((s) => s.symbol));
      } catch {
        // nav is non-critical
      }
    }
  }

  async function handleDeleteTicker() {
    if (!tickerMenu) return;
    const { watchlistId, symbol } = tickerMenu;
    setTickerMenu(null);
    try {
      await watchlistApi.deleteStock(watchlistId, symbol);
      removeWatchlistStock(watchlistId, symbol);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

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
          <Group gap="xs">
            {serverTime && <AnimatedTime time={serverTime} />}
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate('/settings')}>
              <IconSettings size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea style={{ height: '100%' }} p="xs">
          {watchlists.map((w) => (
            <NavLink
              key={w.id}
              label={w.name}
              leftSection={<span>{w.emoji}</span>}
              opened={expandedWatchlistIds[w.id] ?? false}
              onClick={() => handleToggle(w.id)}
              childrenOffset={12}
            >
              {(stocksByWatchlist[w.id] ?? []).length > 0 ? (
                (stocksByWatchlist[w.id] ?? []).map((symbol) => (
                  <Menu
                    key={symbol}
                    opened={tickerMenu?.watchlistId === w.id && tickerMenu?.symbol === symbol}
                    onChange={(o) => !o && setTickerMenu(null)}
                    withinPortal
                  >
                    <Menu.Target>
                      <NavLink
                        label={symbol}
                        component={RouterNavLink}
                        to={`/stock/${symbol}`}
                        styles={{
                          label: { fontFamily: 'monospace', fontSize: 12 },
                          root: { padding: '2px 8px' },
                        }}
                        onContextMenu={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setTickerMenu({ watchlistId: w.id, symbol });
                        }}
                      />
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconTrash size={14} />}
                        color="red"
                        onClick={handleDeleteTicker}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                ))
              ) : (
                <Text size="xs" c="dimmed" px={8} py={4}>
                  {stocksByWatchlist[w.id] ? 'No stocks' : 'Loading…'}
                </Text>
              )}
            </NavLink>
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
