// Details a client gives for a custom design request (portal → Design → custom design).
// Saved in EventDesignBrief.textValues under these keys; the operator sees them on the event's Designs tab.

export type CustomField =
  | { key: string; label: string; kind: 'choice'; options: string[] }
  | { key: string; label: string; kind: 'text'; placeholder: string; max: number };

export const CUSTOM_FIELDS: CustomField[] = [
  { key: 'custom_size', label: 'Print size', kind: 'choice', options: ['4×6 Landscape', '4×6 Portrait', '2×6 Strip', 'Not sure'] },
  { key: 'custom_photos', label: 'Photos per print', kind: 'choice', options: ['1', '2', '3', '4', 'Not sure'] },
  { key: 'custom_event_type', label: 'Type of event', kind: 'choice', options: ['Wedding', 'Birthday', 'Corporate', 'Graduation', 'Holiday', 'Other'] },
  { key: 'custom_names', label: 'Names or title to print', kind: 'text', placeholder: 'Ana & Ben, or Acme Holiday Party', max: 80 },
  { key: 'custom_date', label: 'Date or tagline', kind: 'text', placeholder: 'June 14, 2027', max: 60 },
  { key: 'custom_hashtag', label: 'Hashtag', kind: 'text', placeholder: '#AnaAndBen2027', max: 40 },
  { key: 'custom_colors', label: 'Colors', kind: 'text', placeholder: 'Navy and gold, or match our invitation', max: 120 },
  { key: 'custom_logo', label: 'Logo or monogram', kind: 'text', placeholder: "Describe it, or say you'll send the file", max: 200 },
];

// Client-entered brief text is kept small: strings only, bounded length and count
export function cleanTextValues(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (typeof val === 'string' && k.length <= 64 && val.trim()) out[k] = val.slice(0, 500);
  }
  return out;
}
