import React, { useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
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
import { EmojiPicker } from '../../components/EmojiPicker';
import { DEFAULT_ICON } from '../../utils/helpers';
import { SortableTab } from '../../components/SortableTab';

export function Home() {
  const tabOrientation = useAppStore((s) => s.tabOrientation);
  const watchlists = useAppStore((s) => s.watchlists);
  const addWatchlist = useAppStore((s) => s.addWatchlist);
  const updateWatchlist = useAppStore((s) => s.updateWatchlist);
  const removeWatchlist = useAppStore((s) => s.removeWatchlist);
  const setWatchlists = useAppStore((s) => s.setWatchlists);

  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem('activeWatchlistId'),
  );

  function setActiveIdPersisted(id: string | null) {
    setActiveId(id);
    if (id !== null) localStorage.setItem('activeWatchlistId', id);
    else localStorage.removeItem('activeWatchlistId');
  }

  const resolvedActiveId =
    activeId !== null ? activeId : watchlists[0] ? String(watchlists[0].id) : null;

  const [targetWatchlist, setTargetWatchlist] = useState<Watchlist | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState(DEFAULT_ICON);
  const [renameOpened, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = watchlists.findIndex((w) => String(w.id) === active.id);
    const newIndex = watchlists.findIndex((w) => String(w.id) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(watchlists, oldIndex, newIndex);
    setWatchlists(reordered);
    const ids = reordered.filter((w) => !w.is_default).map((w) => w.id);
    try {
      await watchlistApi.reorder(ids);
    } catch (e) {
      notifyError((e as Error).message);
      setWatchlists(watchlists);
    }
  }

  function onContextMenuRename(w: Watchlist) {
    setTargetWatchlist(w);
    setNameInput(w.name);
    setIconInput(w.emoji);
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
      const created = await watchlistApi.create(name, iconInput || DEFAULT_ICON);
      addWatchlist(created);
      setActiveIdPersisted(String(created.id));
      closeCreate();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleRename() {
    const name = nameInput.trim();
    if (!name || !targetWatchlist) return;
    try {
      const updated = await watchlistApi.rename(
        targetWatchlist.id,
        name,
        iconInput || DEFAULT_ICON,
      );
      updateWatchlist(updated);
      closeRename();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!targetWatchlist) return;
    try {
      await watchlistApi.delete(targetWatchlist.id);
      removeWatchlist(targetWatchlist.id);
      const remaining = watchlists.filter((w) => w.id !== targetWatchlist.id);
      setActiveIdPersisted(remaining.length > 0 ? String(remaining[0].id) : null);
      closeDelete();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  return (
    <>
      <Modal opened={createOpened} onClose={closeCreate} title="New Watchlist" size="sm">
        <Stack>
          <Group align="flex-end" gap="xs">
            <EmojiPicker value={iconInput} onChange={setIconInput} />
            <TextInput
              label="Name"
              placeholder="Watchlist name"
              value={nameInput}
              onChange={(e) => setNameInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1 }}
              data-autofocus
            />
          </Group>
          <Button onClick={handleCreate}>Create</Button>
        </Stack>
      </Modal>

      <Modal opened={renameOpened} onClose={closeRename} title="Edit Watchlist" size="sm">
        <Stack>
          <Group align="flex-end" gap="xs">
            <EmojiPicker value={iconInput} onChange={setIconInput} />
            <TextInput
              label="Name"
              placeholder="Watchlist name"
              value={nameInput}
              ref={nameInputRef}
              onChange={(e) => setNameInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              style={{ flex: 1 }}
              data-autofocus
            />
          </Group>
          <Button onClick={handleRename}>Save</Button>
        </Stack>
      </Modal>

      <Modal opened={deleteOpened} onClose={closeDelete} title="Delete Watchlist" size="sm">
        <Stack>
          <Text>
            Are you sure you want to delete <strong>{targetWatchlist?.name}</strong>? This cannot
            be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Tabs
        value={resolvedActiveId}
        onChange={setActiveIdPersisted}
        orientation={tabOrientation === 'vertical' ? 'vertical' : 'horizontal'}
        style={{ height: '100%' }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={watchlists.map((w) => String(w.id))}
            strategy={tabOrientation === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy}
          >
        <Tabs.List style={tabOrientation === 'vertical' ? { minWidth: 160 } : undefined}>
          {watchlists.map((w) => {
            const menu = (
              <Menu
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
                    {w.emoji} {w.name}
                  </Tabs.Tab>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconPencil size={14} />}
                    onClick={() => onContextMenuRename(w)}
                  >
                    Edit
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
            );
            return w.is_default ? (
              <React.Fragment key={w.id}>{menu}</React.Fragment>
            ) : (
              <SortableTab key={w.id} id={String(w.id)}>
                {menu}
              </SortableTab>
            );
          })}
          {tabOrientation === 'vertical' ? (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconPlus size={14} />}
              fullWidth
              mt={4}
              onClick={() => {
                setNameInput('');
                setIconInput(DEFAULT_ICON);
                openCreate();
              }}
            >
              New Watchlist
            </Button>
          ) : (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              m={4}
              onClick={() => {
                setNameInput('');
                setIconInput(DEFAULT_ICON);
                openCreate();
              }}
            >
              <IconPlus size={14} />
            </ActionIcon>
          )}
        </Tabs.List>
          </SortableContext>
        </DndContext>

        {watchlists.map((w) => (
          <Tabs.Panel key={w.id} value={String(w.id)} pt="xs" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {resolvedActiveId === String(w.id) && <WatchlistPanel watchlist={w} />}
          </Tabs.Panel>
        ))}

        {watchlists.length === 0 && (
          <Text c="dimmed" p="md">
            No watchlists found.
          </Text>
        )}
      </Tabs>
    </>
  );
}
