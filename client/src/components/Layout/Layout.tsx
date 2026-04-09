import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Slider,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router-dom';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { IconSettings, IconTrash, IconSortAZ, IconSortDescendingNumbers, IconCalendarDown, IconSearch } from '@tabler/icons-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [minScore, setMinScore] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isFiltering = searchQuery.trim() !== '' || minScore > 0;
  const upperQuery = searchQuery.trim().toUpperCase();

  useServerEvents();

  // Fetch watchlists once on mount — Layout is always rendered.
  useEffect(() => {
    watchlistApi.list().then(setWatchlists).catch(() => {});
  }, [setWatchlists]);

  // Eagerly fetch stocks for all watchlists on first load.
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (watchlists.length === 0 || initialFetchDone.current) return;
    initialFetchDone.current = true;
    watchlists
      .filter((w) => !stocksByWatchlist[w.id])
      .forEach((w) => {
        watchlistApi
          .listStocks(w.id)
          .then((stocks) => setWatchlistStocks(w.id, stocks.map((s) => ({ symbol: s.symbol, score: s.score, added_at: s.added_at }))))
          .catch(() => {});
      });
  }, [watchlists, stocksByWatchlist, setWatchlistStocks]);

  function handleToggle(id: number) {
    toggleWatchlistExpanded(id);
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
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="xs"
    >
      <AppShell.Header>
        <Group h="100%" gap={0} wrap="nowrap">
          {/* Left zone — logo only, matches navbar width */}
          <Group px="md" justify="center" style={{ width: 220, flexShrink: 0 }}>
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
          {/* Right zone — right-aligned controls */}
          <Group px="md" gap="md" wrap="nowrap" justify="flex-end" style={{ flex: 1 }}>
            <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>Min score</Text>
              <Slider
                value={minScore}
                onChange={setMinScore}
                min={0}
                max={10}
                step={0.5}
                size="xs"
                label={(v) => v > 0 ? String(v) : null}
                style={{ width: 120 }}
              />
              {minScore > 0 && <Text size="xs" c="blue.4" style={{ width: 24 }}>{minScore}</Text>}
            </Group>
            <TextInput
              ref={searchRef}
              placeholder="Search tickers…"
              size="xs"
              leftSection={<IconSearch size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ width: 200, flexShrink: 0 }}
            />
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
            {serverTime && <AnimatedTime time={serverTime} />}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea style={{ height: '100%' }} p="xs">
          {watchlists.map((w) => {
            const stocks = stocksByWatchlist[w.id] ?? [];
            let visible = sortNavStocks(stocks, navSort);
            if (isFiltering) {
              visible = visible.filter((s) => {
                const matchesQuery = upperQuery === '' || s.symbol.includes(upperQuery);
                const matchesScore = minScore === 0 || (s.score != null && s.score >= minScore);
                return matchesQuery && matchesScore;
              });
              if (visible.length === 0) return null;
            }
            const isOpen = isFiltering ? true : (expandedWatchlistIds[w.id] ?? false);
            return (
            <NavLink
              key={w.id}
              label={<Text size="sm" fw={600} c="blue.3" style={{ letterSpacing: '0.05em' }}>{w.name}</Text>}
              leftSection={<span>{w.emoji}</span>}
              opened={isOpen}
              onClick={() => { if (!isFiltering) handleToggle(w.id); }}
              childrenOffset={12}
            >
              {visible.length > 0 ? (
                visible.map((stock) => (
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
