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

export function injectNoteStyles() {
  if (document.getElementById('pivot-note-styles')) return;
  const el = document.createElement('style');
  el.id = 'pivot-note-styles';
  el.textContent = PROSE_STYLES;
  document.head.appendChild(el);
}
