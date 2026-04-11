import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, Group, Stack, Box, Text, ActionIcon, Tooltip, SegmentedControl, Button,
} from '@mantine/core';
import {
  IconPencil, IconArrowUpRight, IconMinus, IconLetterT,
  IconArrowBackUp, IconCheck, IconX, IconCrop,
} from '@tabler/icons-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Point { x: number; y: number; }

interface CropRect { x: number; y: number; w: number; h: number; }

type AnnotateTool = 'pen' | 'arrow' | 'line' | 'text';

interface Annotation {
  type: AnnotateTool;
  color: string;
  lineWidth: number;
  points?: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  pos?: Point;
}

type Handle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'move';

// ─── Constants ───────────────────────────────────────────────────────────────

const PALETTE = ['#ffffff', '#f59e0b', '#ef4444', '#22c55e', '#38bdf8', '#000000'];
const STROKE_SIZES = [2, 4, 7, 12];
const HANDLE_RADIUS = 6;

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawPen(ctx: CanvasRenderingContext2D, points: Point[], color: string, lw: number) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string, lw: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLen = 10 + lw * 3;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Shaft
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, pos: Point, color: string, lw: number) {
  if (!text) return;
  const fontSize = 14 + lw * 3;
  ctx.save();
  ctx.font = `500 ${fontSize}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, pos.x, pos.y);
  ctx.restore();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, preview = false) {
  if (preview) {
    ctx.save();
    ctx.globalAlpha = 0.75;
  }
  switch (a.type) {
    case 'pen':
      if (a.points) drawPen(ctx, a.points, a.color, a.lineWidth);
      break;
    case 'line':
      if (a.start && a.end) drawLine(ctx, a.start, a.end, a.color, a.lineWidth);
      break;
    case 'arrow':
      if (a.start && a.end) drawArrow(ctx, a.start, a.end, a.color, a.lineWidth);
      break;
    case 'text':
      if (a.text && a.pos) drawText(ctx, a.text, a.pos, a.color, a.lineWidth);
      break;
  }
  if (preview) ctx.restore();
}

function getCropHandles(r: CropRect): { id: Handle; x: number; y: number; cursor: string }[] {
  return [
    { id: 'tl', x: r.x,           y: r.y,           cursor: 'nw-resize' },
    { id: 'tc', x: r.x + r.w / 2, y: r.y,           cursor: 'n-resize'  },
    { id: 'tr', x: r.x + r.w,     y: r.y,           cursor: 'ne-resize' },
    { id: 'ml', x: r.x,           y: r.y + r.h / 2, cursor: 'w-resize'  },
    { id: 'mr', x: r.x + r.w,     y: r.y + r.h / 2, cursor: 'e-resize'  },
    { id: 'bl', x: r.x,           y: r.y + r.h,     cursor: 'sw-resize' },
    { id: 'bc', x: r.x + r.w / 2, y: r.y + r.h,     cursor: 's-resize'  },
    { id: 'br', x: r.x + r.w,     y: r.y + r.h,     cursor: 'se-resize' },
  ];
}

function applyHandle(handle: Handle, start: CropRect, dx: number, dy: number, imgW: number, imgH: number): CropRect {
  let { x, y, w, h } = start;
  switch (handle) {
    case 'tl': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'tc':           y += dy;          h -= dy; break;
    case 'tr':           y += dy; w += dx; h -= dy; break;
    case 'ml': x += dx;          w -= dx;          break;
    case 'mr':                    w += dx;          break;
    case 'bl': x += dx;          w -= dx; h += dy; break;
    case 'bc':                             h += dy; break;
    case 'br':                    w += dx; h += dy; break;
    case 'move': x += dx; y += dy;                 break;
  }
  const minSize = 20;
  w = Math.max(w, minSize);
  h = Math.max(h, minSize);
  x = Math.max(0, Math.min(x, imgW - minSize));
  y = Math.max(0, Math.min(y, imgH - minSize));
  if (x + w > imgW) w = imgW - x;
  if (y + h > imgH) h = imgH - y;
  return { x, y, w, h };
}

function drawCropOverlay(ctx: CanvasRenderingContext2D, r: CropRect, cw: number, ch: number) {
  // Dimmed regions
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, cw, r.y);
  ctx.fillRect(0, r.y + r.h, cw, ch - r.y - r.h);
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, cw - r.x - r.w, r.h);
  ctx.restore();

  // Rule-of-thirds grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(r.x + (r.w * i) / 3, r.y);
    ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + (r.h * i) / 3);
    ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3);
    ctx.stroke();
  }
  ctx.restore();

  // Border
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  // Handles
  const handles = getCropHandles(r);
  handles.forEach(({ x, y }) => {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  imageData: string | null;
  onConfirm: (dataUrl: string) => void;
  onClose: () => void;
}

export function ImageEditorModal({ open, imageData, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<'crop' | 'annotate'>('crop');
  const [tool, setTool] = useState<AnnotateTool>('pen');
  const [color, setColor] = useState('#f59e0b');
  const [strokeWidth, setStrokeWidth] = useState(1); // index into STROKE_SIZES
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pending, setPending] = useState<Annotation | null>(null);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [textState, setTextState] = useState<{ pos: Point; value: string } | null>(null);
  const [cursor, setCursor] = useState('crosshair');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ handle: Handle; startRect: CropRect; startPos: Point } | null>(null);

  // Load image when data changes
  useEffect(() => {
    if (!open || !imageData) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSize(size);
      setCropRect({ x: 0, y: 0, w: size.w, h: size.h });
      setAnnotations([]);
      setPending(null);
      setTextState(null);
      setMode('crop');
    };
    img.src = imageData;
  }, [open, imageData]);

  // Redraw
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgSize) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    annotations.forEach((a) => drawAnnotation(ctx, a));
    if (pending) drawAnnotation(ctx, pending, true);
    if (textState) {
      drawText(ctx, textState.value + '|', textState.pos, color, STROKE_SIZES[strokeWidth]);
    }
    if (mode === 'crop') {
      drawCropOverlay(ctx, cropRect, canvas.width, canvas.height);
    }
  }, [annotations, pending, cropRect, mode, textState, color, strokeWidth, imgSize]);

  useEffect(() => { redraw(); }, [redraw]);

  // Keyboard: text input + undo
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      // Text tool input
      if (textState !== null) {
        if (e.key === 'Enter') {
          if (textState.value.trim()) {
            setAnnotations((prev) => [
              ...prev,
              { type: 'text', color, lineWidth: STROKE_SIZES[strokeWidth], text: textState.value, pos: textState.pos },
            ]);
          }
          setTextState(null);
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') { setTextState(null); e.preventDefault(); return; }
        if (e.key === 'Backspace') {
          setTextState((s) => s ? { ...s, value: s.value.slice(0, -1) } : null);
          e.preventDefault();
          return;
        }
        if (e.key.length === 1) {
          setTextState((s) => s ? { ...s, value: s.value + e.key } : null);
          e.preventDefault();
          return;
        }
      }

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        setAnnotations((prev) => prev.slice(0, -1));
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, textState, color, strokeWidth]);

  function toCanvasCoords(e: React.MouseEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function hitHandle(pos: Point, r: CropRect): Handle | null {
    const handles = getCropHandles(r);
    const thresh = HANDLE_RADIUS * 2.5 * (canvasRef.current!.width / canvasRef.current!.getBoundingClientRect().width);
    for (const h of handles) {
      if (Math.hypot(pos.x - h.x, pos.y - h.y) < thresh) return h.id;
    }
    if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) return 'move';
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    const pos = toCanvasCoords(e);

    if (mode === 'crop') {
      const h = hitHandle(pos, cropRect);
      dragRef.current = { handle: h ?? 'move', startRect: { ...cropRect }, startPos: pos };
      return;
    }

    // Annotate mode
    if (tool === 'text') {
      setTextState({ pos, value: '' });
      return;
    }
    if (tool === 'pen') {
      setPending({ type: 'pen', color, lineWidth: STROKE_SIZES[strokeWidth], points: [pos] });
    } else {
      setPending({ type: tool, color, lineWidth: STROKE_SIZES[strokeWidth], start: pos, end: pos });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const pos = toCanvasCoords(e);

    if (mode === 'crop') {
      if (!dragRef.current) {
        // Update cursor
        const h = hitHandle(pos, cropRect);
        if (h && h !== 'move') {
          const handle = getCropHandles(cropRect).find((x) => x.id === h);
          setCursor(handle?.cursor ?? 'crosshair');
        } else if (h === 'move') {
          setCursor('move');
        } else {
          setCursor('crosshair');
        }
        return;
      }
      const { handle, startRect, startPos } = dragRef.current;
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      setCropRect(applyHandle(handle, startRect, dx, dy, imgSize!.w, imgSize!.h));
      return;
    }

    // Annotate
    if (!pending) return;
    if (tool === 'pen') {
      setPending((p) => p ? { ...p, points: [...(p.points ?? []), pos] } : null);
    } else {
      setPending((p) => p ? { ...p, end: pos } : null);
    }
  }

  function handleMouseUp() {
    dragRef.current = null;

    if (!pending) return;
    const valid =
      (pending.type === 'pen' && (pending.points?.length ?? 0) > 1) ||
      (pending.type !== 'pen' && pending.start && pending.end &&
        Math.hypot(pending.end.x - pending.start.x, pending.end.y - pending.start.y) > 3);
    if (valid) setAnnotations((prev) => [...prev, pending]);
    setPending(null);
  }

  function exportImage(): string {
    const img = imgRef.current!;
    const out = document.createElement('canvas');
    out.width = Math.round(cropRect.w);
    out.height = Math.round(cropRect.h);
    const ctx = out.getContext('2d')!;
    ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
    ctx.save();
    ctx.translate(-cropRect.x, -cropRect.y);
    annotations.forEach((a) => drawAnnotation(ctx, a));
    ctx.restore();
    // Use same resolution as the cropped region but downsample large images
    const MAX = 1920;
    if (out.width > MAX || out.height > MAX) {
      const scale = Math.min(MAX / out.width, MAX / out.height);
      const final = document.createElement('canvas');
      final.width = Math.round(out.width * scale);
      final.height = Math.round(out.height * scale);
      final.getContext('2d')!.drawImage(out, 0, 0, final.width, final.height);
      return final.toDataURL('image/png');
    }
    return out.toDataURL('image/png');
  }

  const lw = STROKE_SIZES[strokeWidth];

  return (
    <Modal
      opened={open}
      onClose={onClose}
      size="xl"
      padding={0}
      withCloseButton={false}
      styles={{
        content: { background: 'var(--mantine-color-dark-8)', border: '1px solid var(--mantine-color-dark-4)', overflow: 'hidden' },
        overlay: { backdropFilter: 'blur(2px)' },
      }}
    >
      {/* ── Toolbar ── */}
      <Group
        px="sm"
        py={6}
        gap="sm"
        wrap="nowrap"
        style={{ borderBottom: '1px solid var(--mantine-color-dark-5)', background: 'var(--mantine-color-dark-9)', minHeight: 42 }}
      >
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => { setMode(v as 'crop' | 'annotate'); setTextState(null); }}
          data={[
            { value: 'crop', label: <Group gap={4} wrap="nowrap"><IconCrop size={12} /><span>Crop</span></Group> },
            { value: 'annotate', label: <Group gap={4} wrap="nowrap"><IconPencil size={12} /><span>Annotate</span></Group> },
          ]}
          styles={{ root: { background: 'var(--mantine-color-dark-7)' } }}
        />

        {mode === 'annotate' && (
          <>
            <Box style={{ width: 1, height: 24, background: 'var(--mantine-color-dark-4)' }} />

            {/* Tools */}
            <Group gap={2}>
              {([
                { id: 'pen' as AnnotateTool, icon: <IconPencil size={14} />, label: 'Pen (freehand)' },
                { id: 'arrow' as AnnotateTool, icon: <IconArrowUpRight size={14} />, label: 'Arrow' },
                { id: 'line' as AnnotateTool, icon: <IconMinus size={14} />, label: 'Line' },
                { id: 'text' as AnnotateTool, icon: <IconLetterT size={14} />, label: 'Text' },
              ] as const).map(({ id, icon, label }) => (
                <Tooltip key={id} label={label} position="bottom">
                  <ActionIcon
                    size="sm"
                    variant={tool === id ? 'filled' : 'subtle'}
                    color={tool === id ? 'yellow' : 'gray'}
                    onClick={() => { setTool(id); setTextState(null); }}
                  >
                    {icon}
                  </ActionIcon>
                </Tooltip>
              ))}
            </Group>

            <Box style={{ width: 1, height: 24, background: 'var(--mantine-color-dark-4)' }} />

            {/* Stroke size */}
            <Group gap={4}>
              {STROKE_SIZES.map((size, i) => (
                <Tooltip key={i} label={`${size}px`} position="bottom">
                  <Box
                    onClick={() => setStrokeWidth(i)}
                    style={{
                      width: 20, height: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      borderRadius: 4,
                      background: strokeWidth === i ? 'var(--mantine-color-dark-4)' : 'transparent',
                    }}
                  >
                    <Box style={{
                      width: Math.min(size + 2, 14),
                      height: Math.min(size + 2, 14),
                      borderRadius: '50%',
                      background: strokeWidth === i ? color : 'var(--mantine-color-gray-5)',
                    }} />
                  </Box>
                </Tooltip>
              ))}
            </Group>

            <Box style={{ width: 1, height: 24, background: 'var(--mantine-color-dark-4)' }} />

            {/* Color palette */}
            <Group gap={4}>
              {PALETTE.map((c) => (
                <Tooltip key={c} label={c} position="bottom">
                  <Box
                    onClick={() => setColor(c)}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: c,
                      cursor: 'pointer',
                      border: color === c ? '2px solid var(--mantine-color-yellow-4)' : '2px solid var(--mantine-color-dark-3)',
                      boxSizing: 'border-box',
                    }}
                  />
                </Tooltip>
              ))}
              <Tooltip label="Custom color" position="bottom">
                <Box style={{ position: 'relative', width: 18, height: 18 }}>
                  <Box style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: PALETTE.includes(color) ? 'var(--mantine-color-dark-4)' : color,
                    border: !PALETTE.includes(color) ? '2px solid var(--mantine-color-yellow-4)' : '2px solid var(--mantine-color-dark-3)',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }} />
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  />
                </Box>
              </Tooltip>
            </Group>

            <Box style={{ marginLeft: 'auto' }}>
              <Tooltip label="Undo (⌘Z)" position="bottom">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  disabled={annotations.length === 0}
                  onClick={() => setAnnotations((p) => p.slice(0, -1))}
                >
                  <IconArrowBackUp size={14} />
                </ActionIcon>
              </Tooltip>
            </Box>
          </>
        )}
      </Group>

      {/* ── Canvas ── */}
      <Box
        style={{
          background: '#0a0a0c',
          padding: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 200,
        }}
      >
        {imgSize && (
          <canvas
            ref={canvasRef}
            width={imgSize.w}
            height={imgSize.h}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '58vh',
              cursor: mode === 'annotate' && tool === 'text' ? 'text' : cursor,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
              borderRadius: 2,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        )}
        {/* Text input hint */}
        {mode === 'annotate' && tool === 'text' && textState === null && (
          <Box style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)' }}>
            <Text size="xs" c="dimmed" style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4 }}>
              Click on the image to place text
            </Text>
          </Box>
        )}
      </Box>

      {/* ── Status bar ── */}
      <Group
        px="sm"
        py={6}
        justify="space-between"
        style={{ borderTop: '1px solid var(--mantine-color-dark-5)', background: 'var(--mantine-color-dark-9)' }}
      >
        <Stack gap={0}>
          {mode === 'crop' && imgSize && (
            <Text size="xs" c="dimmed" ff="monospace">
              {Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
            </Text>
          )}
          {mode === 'annotate' && textState !== null && (
            <Text size="xs" c="yellow.5" ff="monospace">
              Typing — Enter to confirm · Esc to cancel
            </Text>
          )}
          {mode === 'annotate' && textState === null && (
            <Text size="xs" c="dimmed" ff="monospace">
              stroke {lw}px · ⌘Z to undo
            </Text>
          )}
        </Stack>
        <Group gap="xs">
          <Button size="xs" variant="subtle" color="gray" leftSection={<IconX size={12} />} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="xs"
            color="yellow"
            leftSection={<IconCheck size={12} />}
            onClick={() => onConfirm(exportImage())}
          >
            Insert image
          </Button>
        </Group>
      </Group>
    </Modal>
  );
}
