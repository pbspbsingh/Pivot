import { useEffect, useMemo, useRef, useState } from 'react';
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

type NavFocus =
  | { type: 'watchlist'; id: number }
  | { type: 'ticker'; watchlistId: number; symbol: string };

function sameFocus(a: NavFocus, b: NavFocus): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'watchlist' && b.type === 'watchlist') return a.id === b.id;
  if (a.type === 'ticker' && b.type === 'ticker') return a.watchlistId === b.watchlistId && a.symbol === b.symbol;
  return false;
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
  const [navFocus, setNavFocus] = useState<NavFocus | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);
  const initialFetchDone = useRef(false);

  const isFiltering = searchQuery.trim() !== '' || minScore > 0;
  const upperQuery = searchQuery.trim().toUpperCase();

  // Centralised filter + sort logic — used by both render and keyboard nav.
  const visibleWatchlists = useMemo(() => {
    return watchlists.flatMap((w) => {
      const sorted = sortNavStocks(stocksByWatchlist[w.id] ?? [], navSort);
      const stocks = isFiltering
        ? sorted.filter((s) => {
            const matchesQuery = upperQuery === '' || s.symbol.includes(upperQuery);
            const matchesScore = minScore === 0 || (s.score != null && s.score >= minScore);
            return matchesQuery && matchesScore;
          })
        : sorted;
      if (isFiltering && stocks.length === 0) return [];
      const isOpen = isFiltering ? true : (expandedWatchlistIds[w.id] ?? false);
      return [{ watchlist: w, stocks, isOpen }];
    });
  }, [watchlists, stocksByWatchlist, navSort, isFiltering, upperQuery, minScore, expandedWatchlistIds]);

  // Flat ordered list of focusable nav items.
  const flatNav = useMemo<NavFocus[]>(() => {
    const items: NavFocus[] = [];
    for (const { watchlist, stocks, isOpen } of visibleWatchlists) {
      items.push({ type: 'watchlist', id: watchlist.id });
      if (isOpen) {
        for (const s of stocks) {
          items.push({ type: 'ticker', watchlistId: watchlist.id, symbol: s.symbol });
        }
      }
    }
    return items;
  }, [visibleWatchlists]);

  useServerEvents();

  useEffect(() => {
    watchlistApi.list().then(setWatchlists).catch(() => {});
  }, [setWatchlists]);

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

  // Ctrl+K focuses the search bar.
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

  // Scroll focused nav item into view.
  useEffect(() => {
    if (!navFocus || !navContainerRef.current) return;
    const key = navFocus.type === 'watchlist'
      ? `w-${navFocus.id}`
      : `t-${navFocus.watchlistId}-${navFocus.symbol}`;
    navContainerRef.current.querySelector(`[data-nav-key="${key}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [navFocus]);

  function handleToggle(id: number) {
    toggleWatchlistExpanded(id);
  }

  function handleNavKeyDown(e: React.KeyboardEvent) {
    if (flatNav.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!navFocus) { setNavFocus(flatNav[0]); return; }
      const idx = flatNav.findIndex((item) => sameFocus(item, navFocus));
      const next = idx === -1 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1);
      if (next >= 0 && next < flatNav.length) setNavFocus(flatNav[next]);
      return;
    }

    if (!navFocus) return;

    if (e.key === 'ArrowRight' && navFocus.type === 'watchlist' && !isFiltering) {
      e.preventDefault();
      if (!expandedWatchlistIds[navFocus.id]) handleToggle(navFocus.id);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (navFocus.type === 'watchlist' && !isFiltering && expandedWatchlistIds[navFocus.id]) {
        handleToggle(navFocus.id);
      } else if (navFocus.type === 'ticker') {
        setNavFocus({ type: 'watchlist', id: navFocus.watchlistId });
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (navFocus.type === 'ticker') {
        navigate(`/stock/${navFocus.watchlistId}/${navFocus.symbol}`);
      } else if (!isFiltering) {
        handleToggle(navFocus.id);
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
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="xs"
    >
      <AppShell.Header>
        <Group h="100%" gap={0} wrap="nowrap">
          {/* Left zone — logo only, matches navbar width */}
          <Group px="md" style={{ width: 220, flexShrink: 0 }}>
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
        <div
          ref={navContainerRef}
          tabIndex={0}
          onKeyDown={handleNavKeyDown}
          style={{ height: '100%', outline: 'none' }}
        >
          <ScrollArea style={{ height: '100%' }} p="xs">
            {visibleWatchlists.map(({ watchlist: w, stocks, isOpen }) => {
              const wFocused = navFocus?.type === 'watchlist' && navFocus.id === w.id;
              return (
                <NavLink
                  key={w.id}
                  data-nav-key={`w-${w.id}`}
                  tabIndex={-1}
                  label={<Text size="sm" fw={600} c="blue.3" style={{ letterSpacing: '0.05em' }}>{w.name}</Text>}
                  leftSection={<span>{w.emoji}</span>}
                  opened={isOpen}
                  onClick={() => {
                    setNavFocus({ type: 'watchlist', id: w.id });
                    navContainerRef.current?.focus();
                    if (!isFiltering) handleToggle(w.id);
                  }}
                  childrenOffset={12}
                  styles={{ root: { padding: '2px 8px', backgroundColor: wFocused ? 'var(--mantine-color-dark-4)' : undefined, borderRadius: 4 } }}
                >
                  {stocks.length > 0 ? (
                    stocks.map((stock) => {
                      const tFocused = navFocus?.type === 'ticker' && navFocus.watchlistId === w.id && navFocus.symbol === stock.symbol;
                      return (
                        <Menu
                          key={stock.symbol}
                          opened={tickerMenu?.watchlistId === w.id && tickerMenu?.symbol === stock.symbol}
                          onChange={(o) => !o && setTickerMenu(null)}
                          withinPortal
                        >
                          <Menu.Target>
                            <NavLink
                              data-nav-key={`t-${w.id}-${stock.symbol}`}
                              tabIndex={-1}
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
                              onClick={() => {
                                setNavFocus({ type: 'ticker', watchlistId: w.id, symbol: stock.symbol });
                                navContainerRef.current?.focus();
                              }}
                              styles={{ root: { padding: '2px 8px', backgroundColor: tFocused ? 'var(--mantine-color-dark-4)' : undefined, borderRadius: 4 } }}
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
                      );
                    })
                  ) : (
                    <Text size="xs" c="dimmed" px={8} py={4}>
                      {stocksByWatchlist[w.id] ? 'No stocks' : 'Loading…'}
                    </Text>
                  )}
                </NavLink>
              );
            })}
          </ScrollArea>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
