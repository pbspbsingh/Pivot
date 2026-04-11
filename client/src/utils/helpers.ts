import { notifyError, notifySuccess } from './notify';

export const DEFAULT_ICON = '📋';

// Extracts the first emoji grapheme cluster from a string.
// Returns empty string if no emoji is found (rejects plain ASCII input).
export function extractEmoji(input: string): string {
  if (!input) return '';
  const segments = [...new Intl.Segmenter().segment(input)];
  const found = segments.find(({ segment }) => /[^\u0020-\u007E]/.test(segment));
  return found?.segment ?? '';
}

export async function copyToClipboard(text: string, label: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error('Clipboard API unavailable');
    }
    notifySuccess(`${label} copied`);
  } catch {
    // Fallback for Firefox and other browsers that block the Clipboard API.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('execCommand copy returned false');
      notifySuccess(`${label} copied`);
    } catch (fallbackErr) {
      console.error('Copy failed:', fallbackErr);
      notifyError(`Failed to copy ${label.toLowerCase()}`);
    }
  }
}

export function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function consensusColor(consensus: string | null) {
  if (!consensus) return 'gray';
  const c = consensus.toLowerCase();
  if (c.includes('strong buy')) return 'teal';
  if (c.includes('buy')) return 'green';
  if (c.includes('strong sell')) return 'red';
  if (c.includes('sell')) return 'orange';
  return 'gray';
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
