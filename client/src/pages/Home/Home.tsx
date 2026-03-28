import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { watchlistApi } from '../../api/watchlists';
import { useAppStore } from '../../store';
import type { Watchlist } from '../../types';
import { notifyError } from '../../utils/notify';
import { WatchlistPanel } from './WatchlistPanel';

export function Home() {
  const tabOrientation = useAppStore((s) => s.tabOrientation);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [targetWatchlist, setTargetWatchlist] = useState<Watchlist | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [renameOpened, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    watchlistApi.list()
      .then((data) => {
        setWatchlists(data);
        if (data.length > 0) setActiveId(String(data[0].id));
      })
      .catch((e: Error) => notifyError(e.message));
  }, []);

  function onContextMenuRename(w: Watchlist) {
    setTargetWatchlist(w);
    setNameInput(w.name);
    openRename();
  }

  function onContextMenuDelete(w: Watchlist) {
    setTargetWatchlist(w);
    openDelete();
  }

  async function handleCreate() {
    const name = nameInput.trim();
    if (!name) return;
    try {
      const created = await watchlistApi.create(name);
      setWatchlists((prev) => [...prev, created]);
      setActiveId(String(created.id));
      closeCreate();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleRename() {
    const name = nameInput.trim();
    if (!name || !targetWatchlist) return;
    try {
      const updated = await watchlistApi.rename(targetWatchlist.id, name);
      setWatchlists((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      closeRename();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!targetWatchlist) return;
    try {
      await watchlistApi.delete(targetWatchlist.id);
      const remaining = watchlists.filter((w) => w.id !== targetWatchlist.id);
      setWatchlists(remaining);
      setActiveId(remaining.length > 0 ? String(remaining[0].id) : null);
      closeDelete();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  return (
    <>
      <Modal opened={createOpened} onClose={closeCreate} title="New Watchlist" size="sm">
        <Stack>
          <TextInput
            placeholder="Watchlist name"
            value={nameInput}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            data-autofocus
          />
          <Button onClick={handleCreate}>Create</Button>
        </Stack>
      </Modal>

      <Modal opened={renameOpened} onClose={closeRename} title="Rename Watchlist" size="sm">
        <Stack>
          <TextInput
            ref={nameInputRef}
            placeholder="Watchlist name"
            value={nameInput}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            data-autofocus
          />
          <Button onClick={handleRename}>Rename</Button>
        </Stack>
      </Modal>

      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="Delete Watchlist"
        size="sm"
      >
        <Stack>
          <Text>
            Are you sure you want to delete <strong>{targetWatchlist?.name}</strong>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>

      <Tabs
        value={activeId}
        onChange={setActiveId}
        orientation={tabOrientation === 'vertical' ? 'vertical' : 'horizontal'}
        style={{ height: '100%' }}
      >
        <Tabs.List
          style={tabOrientation === 'vertical' ? { minWidth: 160 } : undefined}
        >
          {watchlists.map((w) => (
            <Menu
              key={w.id}
              opened={menuOpenId === w.id}
              onChange={(o) => !o && setMenuOpenId(null)}
              disabled={w.is_default}
              withinPortal
            >
              <Menu.Target>
                <Tabs.Tab
                  value={String(w.id)}
                  onContextMenu={(e) => {
                    if (w.is_default) return;
                    e.preventDefault();
                    setMenuOpenId(w.id);
                  }}
                >
                  {w.name}
                </Tabs.Tab>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPencil size={14} />}
                  onClick={() => onContextMenuRename(w)}
                >
                  Rename
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={() => onContextMenuDelete(w)}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ))}
          {tabOrientation === 'vertical' ? (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconPlus size={14} />}
              fullWidth
              mt={4}
              onClick={() => { setNameInput(''); openCreate(); }}
            >
              New Watchlist
            </Button>
          ) : (
            <ActionIcon variant="subtle" color="gray" size="sm" m={4} onClick={() => { setNameInput(''); openCreate(); }}>
              <IconPlus size={14} />
            </ActionIcon>
          )}
        </Tabs.List>

        {watchlists.map((w) => (
          <Tabs.Panel key={w.id} value={String(w.id)} pt="xs">
            {activeId === String(w.id) && <WatchlistPanel watchlist={w} />}
          </Tabs.Panel>
        ))}

        {watchlists.length === 0 && (
          <Text c="dimmed" p="md">No watchlists found.</Text>
        )}
      </Tabs>
    </>
  );
}
