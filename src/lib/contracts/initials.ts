// "Initial Here" boxes in contracts: {{initial:Payment terms}} markers that the client initials before signing.
// Merge tags leave the markers in place; the portal turns them into boxes and the PDF prints the initials.

export type ClientInitial = { label: string; initials: string; initialedAt: string; ipAddress: string };

const MARKER = /{{\s*initial:([^}]*)}}/g;

function plainLabel(raw: string): string {
  const text = raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 80) || 'This section';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The marker tag the editor inserts. */
export const initialMarker = (label: string) => '{{initial:' + label.replace(/[{}]/g, '').trim() + '}}';

/** Section labels of every Initial Here box, in document order. */
export function initialLabels(html: string): string[] {
  return Array.from(html.matchAll(MARKER), m => plainLabel(m[1]));
}

/** Replace each marker with whatever `render` returns for it (index, label). */
export function replaceInitialMarkers(html: string, render: (index: number, label: string) => string): string {
  let i = 0;
  return html.replace(MARKER, (_, raw: string) => render(i++, plainLabel(raw)));
}

/** "Jane Q. Doe" → "JQD" */
export function initialsFromName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map(w => w[0]!.toUpperCase()).join('').slice(0, 4);
}

/** Initial Here boxes as HTML: empty buttons the client taps, or the initials once given. */
export function initialBoxesHtml(html: string, stamps: (string | null | undefined)[], opts: { interactive?: boolean } = {}): string {
  return replaceInitialMarkers(html, (i, label) => {
    const done = stamps[i];
    if (done) {
      return `<span data-initial-idx="${i}" class="not-prose inline-flex items-center gap-1.5 align-middle mx-1 px-2 py-0.5 rounded-md border border-green-300 bg-green-50 text-xs text-green-800${opts.interactive ? ' cursor-pointer' : ''}" title="${esc(label)}"><span class="font-semibold font-mono">${esc(done)}</span><span class="text-green-700">${esc(label)}</span></span>`;
    }
    return opts.interactive
      ? `<button type="button" data-initial-idx="${i}" class="not-prose inline-flex items-center gap-1.5 align-middle mx-1 px-2 py-0.5 rounded-md border-2 border-dashed border-orange-300 bg-orange-50 text-xs font-semibold text-orange-700 hover:bg-orange-100">Initial here<span class="font-normal text-orange-600">${esc(label)}</span></button>`
      : `<span data-initial-idx="${i}" class="not-prose inline-flex items-center gap-1.5 align-middle mx-1 px-2 py-0.5 rounded-md border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500">Initial here<span>${esc(label)}</span></span>`;
  });
}

/** Saved initials, tolerating anything unexpected in the JSON column. */
export function savedInitials(value: unknown): ClientInitial[] {
  return Array.isArray(value) ? (value as ClientInitial[]).filter(v => v && typeof v.initials === 'string') : [];
}
