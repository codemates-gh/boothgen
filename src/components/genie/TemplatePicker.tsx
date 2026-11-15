'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Layout, LayoutPreview } from '@/components/genie/parts';

// Visual layout picker: a grid of layout thumbnails at their real shape. Clicking one adds it.
// Used by Genie → Event Defaults → Templates and an event's Genie page → Add Template.

export type PickerTemplate = { id: string; name: string; scope: 'standard' | 'mine'; layout: Layout; alternateLayout?: Layout | null; hidden?: boolean };
export type PickerLibrary = { standard: PickerTemplate[]; mine: PickerTemplate[] };

type Format = 'all' | 'landscape' | 'portrait' | 'strip';
const formatOf = (l: Layout): Exclude<Format, 'all'> => l.format === '2x6' ? 'strip' : l.orientation === 'landscape' ? 'landscape' : 'portrait';
const FORMATS: [Format, string][] = [['all', 'All'], ['landscape', '4×6 landscape'], ['portrait', '4×6 portrait'], ['strip', '2×6 strip']];
const photos = (l: Layout) => new Set(l.slots.map(s => s.shotIndex)).size;

// Same height for every tile so shapes compare at a glance; landscape capped by width
const THUMB_H = 120, THUMB_MAX_W = 160;
export const thumbWidth = (l: Layout, h = THUMB_H, maxW = THUMB_MAX_W) => Math.round(Math.min(maxW, h * l.widthPx / l.heightPx));

export function TemplatePicker({ open, onClose, library, isAdded, allowAddAgain, onAdd, busyId, error, alternateOption, highlightId, highlightLabel }: {
  open: boolean; onClose: () => void;
  library: PickerLibrary | null;
  isAdded: (id: string) => boolean;
  allowAddAgain?: boolean; // an event can have the same layout twice; defaults can't
  onAdd: (t: PickerTemplate, alternate: boolean) => void;
  busyId?: string | null; error?: string;
  alternateOption?: boolean; // offer "Include the other orientation" when a layout has one
  highlightId?: string | null; highlightLabel?: string; // e.g. the client's design-brief pick
}) {
  const [tab, setTab] = useState<'standard' | 'mine'>('standard');
  const [format, setFormat] = useState<Format>('all');
  const [withAlternate, setWithAlternate] = useState<Record<string, boolean>>({});

  // Open on the tab that has layouts
  useEffect(() => {
    if (open && library && library.standard.length === 0 && library.mine.length > 0) setTab('mine');
  }, [open, library]);

  const list = library ? library[tab] : [];
  const present = new Set(list.map(t => formatOf(t.layout)));
  const shown = list.filter(t => format === 'all' || formatOf(t.layout) === format);

  return (
    <Modal open={open} onClose={onClose} title="Add a Template" className="max-w-3xl">
      <div className="flex border-b border-gray-200 mb-3" role="tablist">
        {(['standard', 'mine'] as const).map(k => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setFormat('all'); }}
            className={'px-4 py-2 text-[13px] font-medium border-b-2 -mb-px ' + (tab === k ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
            {k === 'standard' ? 'Standard' : 'My Layouts'}{library ? ` (${library[k].length})` : ''}
          </button>
        ))}
      </div>

      {present.size > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Filter by format">
          {FORMATS.filter(([f]) => f === 'all' || present.has(f)).map(([f, label]) => (
            <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f}
              className={'px-3 py-1 rounded-full text-xs font-medium border ' + (format === f ? 'bg-[#1F1F3D] text-white border-[#1F1F3D]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {!library ? <p className="text-sm text-gray-400">Loading…</p> : shown.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          {tab === 'mine' && list.length === 0
            ? <>You haven&apos;t made any layouts yet. <Link href="/templates" className="text-brand hover:underline">Open the template designer</Link>.</>
            : 'No layouts here yet.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">Click a layout to add it.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {shown.map(t => {
              const added = isAdded(t.id);
              const disabled = (added && !allowAddAgain) || !!busyId;
              return (
                <div key={t.id} className={'rounded-lg border flex flex-col ' + (added ? 'border-green-300 bg-green-50/40' : 'border-gray-200')}>
                  <button type="button" disabled={disabled} onClick={() => onAdd(t, !!withAlternate[t.id])}
                    aria-label={`${added ? (allowAddAgain ? 'Add again: ' : 'Already added: ') : 'Add '}${t.name}, ${FORMATS.find(([f]) => f === formatOf(t.layout))?.[1]}, ${photos(t.layout)} photo${photos(t.layout) === 1 ? '' : 's'}`}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg text-left w-full hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0085FF] disabled:cursor-default disabled:hover:bg-transparent">
                    <div className="h-[120px] flex items-center justify-center">
                      <LayoutPreview layout={t.layout} width={thumbWidth(t.layout)}/>
                    </div>
                    <div className="w-full min-w-0">
                      <p className="text-sm font-medium truncate" title={t.name}>{t.name}</p>
                      <p className="text-xs text-gray-500">{FORMATS.find(([f]) => f === formatOf(t.layout))?.[1]} · {photos(t.layout)} photo{photos(t.layout) === 1 ? '' : 's'}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {added && <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-1 inline"/>Added</Badge>}
                        {highlightId === t.id && highlightLabel && <Badge variant="info">{highlightLabel}</Badge>}
                        {busyId === t.id && <span className="text-xs text-gray-500">Adding…</span>}
                      </div>
                    </div>
                  </button>
                  {alternateOption && t.alternateLayout && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 px-3 pb-3 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded" checked={!!withAlternate[t.id]} onChange={e => setWithAlternate(w => ({ ...w, [t.id]: e.target.checked }))}/>
                      Include {t.alternateLayout.orientation} version
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
