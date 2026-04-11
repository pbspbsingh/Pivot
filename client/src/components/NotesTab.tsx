import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, Box, Center, Group, Loader, Modal, Text, Tooltip,
} from '@mantine/core';
import {
  IconArrowsMaximize, IconDeviceFloppy, IconEdit, IconEye,
} from '@tabler/icons-react';
import { notesApi } from '../api/notes';
import { notifyError } from '../utils/notify';
import { ImageEditorModal } from './ImageEditorModal';

// ─── Markdown read view ───────────────────────────────────────────────────────

const PROSE_STYLES = `
.pivot-note { color: var(--mantine-color-gray-3); font-size: 14px; line-height: 1.75; }
.pivot-note h1,.pivot-note h2,.pivot-note h3,.pivot-note h4 {
  color: var(--mantine-color-gray-1); font-weight: 600; margin: 1.4em 0 0.5em;
  padding-left: 10px; border-left: 3px solid #f59e0b;
}
.pivot-note h1 { font-size: 1.35em; }
.pivot-note h2 { font-size: 1.15em; }
.pivot-note h3 { font-size: 1em; }
.pivot-note p { margin: 0.7em 0; }
.pivot-note a { color: #f59e0b; text-decoration: none; }
.pivot-note a:hover { text-decoration: underline; }
.pivot-note strong { color: var(--mantine-color-gray-1); font-weight: 600; }
.pivot-note em { color: var(--mantine-color-gray-4); }
.pivot-note code {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.85em;
  background: var(--mantine-color-dark-6); color: var(--mantine-color-gray-2);
  padding: 1px 5px; border-radius: 3px;
}
.pivot-note pre {
  background: var(--mantine-color-dark-9); border: 1px solid var(--mantine-color-dark-4);
  border-radius: 4px; padding: 12px 16px; overflow-x: auto; margin: 1em 0;
}
.pivot-note pre code { background: none; padding: 0; font-size: 12px; }
.pivot-note blockquote {
  border-left: 3px solid var(--mantine-color-dark-3); margin: 1em 0;
  padding: 2px 0 2px 14px; color: var(--mantine-color-gray-5);
}
.pivot-note img {
  max-width: 100%; border-radius: 4px; margin: 12px 0; display: block;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
}
.pivot-note hr { border: none; border-top: 1px solid var(--mantine-color-dark-4); margin: 1.5em 0; }
.pivot-note ul, .pivot-note ol { padding-left: 1.5em; margin: 0.6em 0; }
.pivot-note li { margin: 0.25em 0; }
.pivot-note table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 13px; }
.pivot-note th {
  text-align: left; padding: 6px 10px; font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--mantine-color-gray-5);
  border-bottom: 1px solid var(--mantine-color-dark-3);
}
.pivot-note td { padding: 6px 10px; border-bottom: 1px solid var(--mantine-color-dark-6); }
.pivot-note tr:last-child td { border-bottom: none; }
.pivot-note input[type="checkbox"] { accent-color: #f59e0b; margin-right: 6px; }
`;

function injectStyles() {
  if (document.getElementById('pivot-note-styles')) return;
  const el = document.createElement('style');
  el.id = 'pivot-note-styles';
  el.textContent = PROSE_STYLES;
  document.head.appendChild(el);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  symbol: string;
}

interface SelectedImg {
  el: HTMLImageElement;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DragState {
  startX: number;
  startWidth: number;
}

export function NotesTab({ symbol }: Props) {
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [content, setContent] = useState('');
  const [html, setHtml] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedImg, setSelectedImg] = useState<SelectedImg | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const readContainerRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef(0);
  const loadedSymbolRef = useRef<string | null>(null);
  const isDirty = content !== savedContent;

  useEffect(() => { injectStyles(); }, []);

  // Load note when symbol changes
  useEffect(() => {
    setLoading(true);
    setMode('read');
    loadedSymbolRef.current = null;
    notesApi.get(symbol)
      .then(({ content: c, html: h }) => {
        setContent(c);
        setSavedContent(c);
        setHtml(h);
        loadedSymbolRef.current = symbol;
      })
      .catch(() => {
        setContent('');
        setSavedContent('');
        setHtml('');
        loadedSymbolRef.current = symbol;
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  const save = useCallback(async (text: string) => {
    setSaving(true);
    try {
      const { html: h } = await notesApi.save(symbol, text);
      setSavedContent(text);
      setHtml(h);
    } catch {
      notifyError('Failed to save note');
    } finally {
      setSaving(false);
    }
  }, [symbol]);

  // Auto-save debounce (1.5s after last keystroke)
  useEffect(() => {
    if (!isDirty || loadedSymbolRef.current !== symbol) return;
    const t = setTimeout(() => save(content), 1500);
    return () => clearTimeout(t);
  }, [content, isDirty, save, symbol]);


  // Paste handler: intercept images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((it) => it.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    cursorPosRef.current = textareaRef.current?.selectionStart ?? content.length;
    const blob = imageItem.getAsFile();
    if (!blob) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImage(ev.target?.result as string);
    reader.readAsDataURL(blob);
  }, [content.length]);

  // Insert image: upload to server, insert markdown reference (or replace existing)
  const insertImage = useCallback(async (dataUrl: string) => {
    setPendingImage(null);
    setUploading(true);
    const oldId = editingImageId;
    setEditingImageId(null);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const id = await notesApi.uploadImage(symbol, blob);
      if (oldId) {
        // Replace existing image reference in markdown
        setContent((prev) => {
          const imgTagRe = new RegExp(`<img[^>]*src="[^"]*\\/api\\/images\\/${oldId}"[^>]*>`, 'g');
          const mdRe = new RegExp(`!\\[[^\\]]*\\]\\([^)]*\\/api\\/images\\/${oldId}[^)]*\\)`, 'g');
          const replacement = `![image](/api/images/${id})`;
          if (imgTagRe.test(prev)) return prev.replace(imgTagRe, replacement);
          return prev.replace(mdRe, replacement);
        });
      } else {
        // Insert at cursor position
        const md = `\n![image](/api/images/${id})\n`;
        const pos = cursorPosRef.current;
        const newContent = content.slice(0, pos) + md + content.slice(pos);
        setContent(newContent);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const newPos = pos + md.length;
            textareaRef.current.setSelectionRange(newPos, newPos);
            textareaRef.current.focus();
          }
        });
      }
    } catch {
      notifyError('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [symbol, content, editingImageId]);

  // 'E' key shortcut to enter edit mode from read mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'Escape') { setMode('read'); setFullscreen(false); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'e' || e.key === 'E') setMode('edit');
      if (e.key === 'f' || e.key === 'F') setFullscreen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (mode === 'edit') {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    // Clear image selection when leaving read mode
    if (mode !== 'read') setSelectedImg(null);
  }, [mode]);

  // Image click → select; click elsewhere → deselect
  useEffect(() => {
    const container = readContainerRef.current;
    if (!container || mode !== 'read') return;

    function computePos(imgEl: HTMLImageElement): SelectedImg {
      const imgRect = imgEl.getBoundingClientRect();
      const containerRect = container!.getBoundingClientRect();
      return {
        el: imgEl,
        top: imgRect.top - containerRect.top + container!.scrollTop,
        left: imgRect.left - containerRect.left,
        width: imgRect.width,
        height: imgRect.height,
      };
    }

    function onClick(e: MouseEvent) {
      if ((e.target as HTMLElement).tagName === 'IMG') {
        const img = e.target as HTMLImageElement;
        setSelectedImg(computePos(img));
        setLiveWidth(img.getBoundingClientRect().width);
      } else {
        setSelectedImg(null);
      }
    }

    async function onDblClick(e: MouseEvent) {
      if ((e.target as HTMLElement).tagName !== 'IMG') return;
      const img = e.target as HTMLImageElement;
      const src = img.getAttribute('src') ?? img.src;
      const match = src.match(/\/api\/images\/(\d+)/);
      if (!match) return;
      const id = match[1];
      try {
        const resp = await fetch(`/api/images/${id}`);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        setEditingImageId(id);
        setPendingImage(dataUrl);
      } catch {
        notifyError('Failed to load image for editing');
      }
    }

    // Recompute overlay position on scroll
    function onScroll() {
      setSelectedImg((prev) => prev ? computePos(prev.el) : null);
    }

    container.addEventListener('click', onClick);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('scroll', onScroll);
    return () => {
      container.removeEventListener('click', onClick);
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('scroll', onScroll);
    };
  }, [mode, html]);

  // Drag-to-resize mouse handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const ds = dragStateRef.current;
      if (!ds || !selectedImg) return;
      const newWidth = Math.max(50, ds.startWidth + (e.clientX - ds.startX));
      setLiveWidth(newWidth);
      selectedImg.el.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      const ds = dragStateRef.current;
      if (!ds) return;
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      // Commit: update markdown with new width
      setLiveWidth((w) => {
        if (w !== null && selectedImg) commitImageWidth(selectedImg.el, Math.round(w));
        return w;
      });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectedImg]);

  function commitImageWidth(imgEl: HTMLImageElement, width: number) {
    const src = imgEl.getAttribute('src') ?? imgEl.src;
    const match = src.match(/\/api\/images\/(\d+)/);
    if (!match) return;
    const id = match[1];
    setContent((prev) => {
      // Replace existing <img ...> tag or markdown syntax with sized <img>
      const imgTagRe = new RegExp(`<img[^>]*src="[^"]*\\/api\\/images\\/${id}"[^>]*>`, 'g');
      const mdRe = new RegExp(`!\\[[^\\]]*\\]\\([^)]*\\/api\\/images\\/${id}[^)]*\\)`, 'g');
      const replacement = `<img src="/api/images/${id}" width="${width}">`;
      if (imgTagRe.test(prev)) return prev.replace(imgTagRe, replacement);
      return prev.replace(mdRe, replacement);
    });
  }

  if (loading) {
    return (
      <Center style={{ height: '100%', background: 'var(--mantine-color-dark-8)' }}>
        <Loader size="sm" color="yellow" />
      </Center>
    );
  }

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-dark-8)' }}>

      {/* ── Content ── */}
      <Box style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            placeholder={'# Notes\n\nStart writing your analysis...\n\nPaste a screenshot with Ctrl+V'}
            spellCheck={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              background: 'var(--mantine-color-dark-9)',
              color: 'var(--mantine-color-gray-2)',
              border: 'none',
              outline: 'none',
              padding: '10px 14px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
              fontSize: 13,
              lineHeight: 1.7,
              resize: 'none',
              caretColor: '#f59e0b',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <Box ref={readContainerRef} style={{ height: '100%', overflowY: 'auto', padding: '10px 14px', position: 'relative' }}>
            {html ? (
              <>
                <div
                  className="pivot-note"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {/* Resize overlay */}
                {selectedImg && (
                  <Box
                    style={{
                      position: 'absolute',
                      top: selectedImg.top,
                      left: selectedImg.left,
                      width: liveWidth ?? selectedImg.width,
                      height: selectedImg.height * ((liveWidth ?? selectedImg.width) / selectedImg.width),
                      pointerEvents: 'none',
                      border: '1px solid #f59e0b',
                      boxSizing: 'border-box',
                      borderRadius: 3,
                    }}
                  >
                    {/* Dimension label + edit hint */}
                    <Box style={{
                      position: 'absolute',
                      top: -22,
                      left: 0,
                      display: 'flex',
                      gap: 6,
                      pointerEvents: 'none',
                    }}>
                      <Box style={{
                        background: 'rgba(0,0,0,0.75)',
                        color: '#f59e0b',
                        fontFamily: 'monospace',
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                      }}>
                        {Math.round(liveWidth ?? selectedImg.width)} px
                      </Box>
                      <Box style={{
                        background: 'rgba(0,0,0,0.75)',
                        color: 'var(--mantine-color-dark-2)',
                        fontFamily: 'monospace',
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                      }}>
                        double-click to annotate
                      </Box>
                    </Box>
                    {/* Drag handle */}
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: -5,
                        right: -5,
                        width: 10,
                        height: 10,
                        background: '#f59e0b',
                        borderRadius: 2,
                        cursor: 'se-resize',
                        pointerEvents: 'all',
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        document.body.style.userSelect = 'none';
                        dragStateRef.current = {
                          startX: e.clientX,
                          startWidth: liveWidth ?? selectedImg.width,
                        };
                      }}
                    />
                  </Box>
                )}
              </>
            ) : (
              <Box
                style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 200, cursor: 'pointer' }}
                onClick={() => setMode('edit')}
              >
                <Text size="sm" c="dark.3" style={{ userSelect: 'none' }}>No notes yet</Text>
                <Text size="xs" c="dark.3" style={{ userSelect: 'none' }}>
                  Press{' '}
                  <Box component="kbd" style={{ fontFamily: 'monospace', background: 'var(--mantine-color-dark-5)', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>
                    E
                  </Box>
                  {' '}to start writing
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Bottom bar ── */}
      <Group
        px="md"
        style={{
          height: 34,
          flexShrink: 0,
          borderTop: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-9)',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: mode indicator + edit info */}
        <Group gap="xs">
          {mode === 'read' && (
            <Tooltip label="Fullscreen (F)" position="top">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setFullscreen(true)}>
                <IconArrowsMaximize size={13} />
              </ActionIcon>
            </Tooltip>
          )}
          {mode === 'edit' && (
            <Text size="xs" c="dark.2" ff="monospace">
              {content.split('\n').length}L · {content.length}C
            </Text>
          )}
          {mode === 'edit' && (
            <Text size="xs" c="dark.4" ff="monospace">
              Esc to read
            </Text>
          )}
        </Group>

        {/* Right: status + actions */}
        <Group gap="xs">
          {uploading && (
            <Group gap={4}>
              <Loader size={10} color="yellow" />
              <Text size="xs" c="yellow.6" ff="monospace">uploading…</Text>
            </Group>
          )}
          {!uploading && (
            <Group gap={4}>
              {saving && <Loader size={10} color="yellow" />}
              <Text
                size="xs"
                ff="monospace"
                c={saving ? 'yellow.6' : isDirty ? 'orange.4' : 'dark.2'}
              >
                {saving ? 'Saving...' : isDirty ? 'Unsaved' : 'Saved'}
              </Text>
            </Group>
          )}
          {mode === 'edit' && (
            <Tooltip label="Save" position="top">
              <ActionIcon
                size="sm"
                variant={isDirty ? 'light' : 'subtle'}
                color={isDirty ? 'yellow' : 'gray'}
                disabled={saving || !isDirty}
                onClick={() => save(content)}
              >
                <IconDeviceFloppy size={13} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={mode === 'read' ? 'Edit (E)' : 'Read (Esc)'} position="top">
            <ActionIcon
              size="sm"
              variant={mode === 'edit' ? 'filled' : 'subtle'}
              color={mode === 'edit' ? 'yellow' : 'gray'}
              onClick={() => setMode(mode === 'read' ? 'edit' : 'read')}
            >
              {mode === 'read' ? <IconEdit size={13} /> : <IconEye size={13} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Modal
        opened={fullscreen}
        onClose={() => setFullscreen(false)}
        fullScreen
        padding="xl"
        title={`${symbol} — Notes`}
        withCloseButton
        styles={{
          content: { background: 'var(--mantine-color-dark-8)', display: 'flex', flexDirection: 'column' },
          body: { flex: 1, overflow: 'auto', padding: '20px 28px' },
        }}
      >
        <div className="pivot-note" dangerouslySetInnerHTML={{ __html: html }} />
      </Modal>

      <ImageEditorModal
        open={pendingImage !== null}
        imageData={pendingImage}
        onConfirm={insertImage}
        onClose={() => setPendingImage(null)}
      />
    </Box>
  );
}
