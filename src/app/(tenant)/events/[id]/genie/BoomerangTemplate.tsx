'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LayoutTemplate, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutPreview, artUrl, type Layout } from '@/components/genie/parts';
import { TemplatePicker, type PickerLibrary, type PickerTemplate } from '@/components/genie/TemplatePicker';
import { CLIP_CANVAS, clipFormatOf, templateSizeLabel, type BoomerangFormat } from '@/lib/genie/schemas';

// Event → Genie → Boomerang → Template: a single-photo layout from the same Templates library as photos (Standard or
// the account's own). The Boomerang plays in its photo frame, at the layout's shape (Square, 9:16, 16:9, 4x6 or 6x4).
// None = a plain square clip.

export type DesignChoice = { source: 'clip' | 'print'; id: string };

// The Templates library (refreshed when the operator comes back from making a template in another tab)
function useLibrary() {
  const [lib, setLib] = useState<PickerLibrary | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/genie-templates');
    if (!r.ok) return;
    const d = await r.json();
    const keep = (ts: (PickerTemplate & { hidden?: boolean })[]) => ts.filter(t => t.layout && !t.hidden);
    setLib({ standard: keep(d.standard), mine: keep(d.mine) });
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);
  return lib;
}

// The chosen template's layout at the Boomerang's shape (its main layout or its alternate)
function chosenLayout(t: PickerTemplate | undefined, format: BoomerangFormat): Layout | null {
  if (!t) return null;
  return [t.layout, t.alternateLayout].find((l): l is Layout => !!l && l.slots.length === 1 && clipFormatOf(l) === format) ?? null;
}

const SIZE_FOR: Partial<Record<BoomerangFormat, string>> = { square: 'square', portrait9x16: '9x16-portrait', landscape16x9: '9x16-landscape', portrait4x6: '4x6-portrait', landscape6x4: '4x6-landscape' };

export function BoomerangTemplateField({ format, design, designProblem, overlay, disabled, onChange }: {
  format: BoomerangFormat; design: DesignChoice | null; designProblem: 'deleted' | 'shape' | null;
  overlay: { url: string } | null; disabled?: boolean;
  onChange: (p: { format?: BoomerangFormat; design?: DesignChoice | null; overlay?: null; designProblem?: null }) => void;
}) {
  const lib = useLibrary();
  const [picking, setPicking] = useState(false);
  const template = design?.source === 'print' ? [...(lib?.standard ?? []), ...(lib?.mine ?? [])].find(t => t.id === design.id) : undefined;
  const layout = chosenLayout(template, format);

  function choose(t: PickerTemplate, alternate: boolean) {
    const l = alternate ? t.alternateLayout : t.layout;
    const f = l ? clipFormatOf(l) : null;
    if (!f) return;
    onChange({ format: f, design: { source: 'print', id: t.id }, overlay: null, designProblem: null });
    setPicking(false);
  }
  const remove = () => onChange({ format: 'square', design: null, overlay: null, designProblem: null });

  return (
    <div className="space-y-3">
      {designProblem && (
        <p className="text-sm text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
          {designProblem === 'deleted' ? 'The template chosen for this Boomerang was deleted' : `The template chosen for this Boomerang no longer has a single-photo ${CLIP_CANVAS[format].label} layout`}, so iPads get the plain Boomerang. Choose another template and save.
        </p>
      )}
      <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
        <div className="w-[72px] h-[72px] flex items-center justify-center flex-shrink-0">
          {layout ? <LayoutPreview layout={layout} width={layout.widthPx >= layout.heightPx ? 72 : Math.round(72 * layout.widthPx / layout.heightPx)}/>
            : overlay && !design ? <img src={artUrl(overlay.url)} alt="" className="max-w-full max-h-full bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:12px_12px]"/>
            : <div className="w-12 h-12 border-2 border-dashed border-gray-300 rounded"/>}
        </div>
        <div className="min-w-0 flex-1">
          {layout && template ? <>
            <p className="text-sm font-medium truncate">{template.name}</p>
            <p className="text-xs text-gray-500">{templateSizeLabel(layout)} · the Boomerang plays in the photo frame</p>
          </> : design ? <>
            <p className="text-sm font-medium">{design.source === 'clip' ? 'Boomerang design' : lib ? 'Template not available' : 'Loading…'}</p>
            <p className="text-xs text-gray-500">{CLIP_CANVAS[format].label}{design.source === 'clip' ? ' · chosen before Boomerang used templates' : ''}</p>
          </> : overlay ? <>
            <p className="text-sm font-medium">Overlay uploaded earlier</p>
            <p className="text-xs text-gray-500">{CLIP_CANVAS[format].label} · kept until you choose a template</p>
          </> : <>
            <p className="text-sm font-medium">None</p>
            <p className="text-xs text-gray-500">Plain square clip</p>
          </>}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}><LayoutTemplate className="w-3.5 h-3.5 mr-1"/>{design || overlay ? 'Change' : 'Choose Template'}</Button>
            {(design || overlay) && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C] hover:bg-red-50" onClick={remove} aria-label="Remove the template"><X className="w-4 h-4"/></Button>}
          </div>
        )}
      </div>
      {!disabled && (
        <Link href={`/templates/new?size=${SIZE_FOR[format] ?? 'square'}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
          <Plus className="w-3 h-3"/>Make a custom one in Templates (Square, 9:16, 16:9 or 4×6, one photo)
        </Link>
      )}
      <TemplatePicker open={picking} onClose={() => setPicking(false)} library={lib} mode="clip"
        isAdded={(id, l) => design?.source === 'print' && design.id === id && clipFormatOf(l) === format}
        allowAddAgain onAdd={choose}/>
    </div>
  );
}
