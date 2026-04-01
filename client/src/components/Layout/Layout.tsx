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
import { IconSettings, IconTrash, IconSortAZ, IconSortDescendingNumbers, IconCalendarDown } from '@tabler/icons-react';
import { watchlistApi } from '../../api/watchlists';
import { useAppStore } from '../../store';
import { useServerEvents } from '../../hooks/useServerEvents';
import { AnimatedTime } from '../AnimatedTime';
import { notifyError } from '../../utils/notify';
import { sortNavStocks } from '../../utils/navSort';
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
  const navSort = useAppStore((s) => s.navSort);
  const setNavSort = useAppStore((s) => s.setNavSort);

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
          .then((stocks) => setWatchlistStocks(w.id, stocks.map((s) => ({ symbol: s.symbol, score: s.score, added_at: s.added_at }))))
          .catch(() => {});
      });
  }, [watchlists, expandedWatchlistIds, stocksByWatchlist, setWatchlistStocks]);

  async function handleToggle(id: number) {
    toggleWatchlistExpanded(id);
    if (!expandedWatchlistIds[id] && !stocksByWatchlist[id]) {
      try {
        const stocks = await watchlistApi.listStocks(id);
        setWatchlistStocks(id, stocks.map((s) => ({ symbol: s.symbol, score: s.score, added_at: s.added_at })));
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
            <ActionIcon
              variant="subtle"
              color="gray"
              title={navSort === 'alpha' ? 'Sort: A–Z' : navSort === 'date' ? 'Sort: Date added' : 'Sort: Score'}
              onClick={() => setNavSort(navSort === 'alpha' ? 'date' : navSort === 'date' ? 'score' : 'alpha')}
            >
              {navSort === 'alpha' && <IconSortAZ size={18} />}
              {navSort === 'date' && <IconCalendarDown size={18} />}
              {navSort === 'score' && <IconSortDescendingNumbers size={18} />}
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate('/settings')}>
              <IconSettings size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea style={{ height: '100%' }} p="xs">
          {watchlists.map((w) => {
            const stocks = stocksByWatchlist[w.id] ?? [];
            const sorted = sortNavStocks(stocks, navSort);
            return (
            <NavLink
              key={w.id}
              label={<Text size="sm" fw={600} c="blue.3" style={{ letterSpacing: '0.05em' }}>{w.name}</Text>}
              leftSection={<span>{w.emoji}</span>}
              opened={expandedWatchlistIds[w.id] ?? false}
              onClick={() => handleToggle(w.id)}
              childrenOffset={12}
            >
              {sorted.length > 0 ? (
                sorted.map((stock) => (
                  <Menu
                    key={stock.symbol}
                    opened={tickerMenu?.watchlistId === w.id && tickerMenu?.symbol === stock.symbol}
                    onChange={(o) => !o && setTickerMenu(null)}
                    withinPortal
                  >
                    <Menu.Target>
                      <NavLink
                        label={
                          <Group justify="space-between" wrap="nowrap" gap={4}>
                            <Text span style={{ fontFamily: 'monospace', fontSize: 11 }}>{stock.symbol}</Text>
                            {stock.score != null && (
                              <Text span size="xs" c="dimmed">{stock.score.toFixed(1)}</Text>
                            )}
                          </Group>
                        }
                        component={RouterNavLink}
                        to={`/stock/${w.id}/${stock.symbol}`}
                        styles={{ root: { padding: '2px 8px' } }}
                        onContextMenu={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setTickerMenu({ watchlistId: w.id, symbol: stock.symbol });
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
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
