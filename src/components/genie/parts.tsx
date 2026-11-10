'use client';
import { useEffect, useState } from 'react';

export type Slot = { id: string; shotIndex: number; x: number; y: number; width: number; height: number; rotationDegrees: number; fit: 'fill' | 'fit' };
export type RemoteAsset = { url: string; sha256: string; contentType: string; bytes: number };
export type Layout = {
  format: '4x6' | '2x6'; orientation: 'portrait' | 'landscape'; widthPx: number; heightPx: number; dpi: number;
  backgroundColor: string; background?: RemoteAsset; overlay?: RemoteAsset; slots: Slot[];
};

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={'flex items-start gap-3 ' + (disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
      <div className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/>
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-gray-200'}`}/>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`}/>
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// Template artwork as the browser should load it: R2 files go through BoothGen (same origin, works for canvas
// export and on networks that block the public bucket URL); anything else loads directly.
export function artUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  try { if (new URL(url).origin === window.location.origin) return url; } catch { return url; }
  return '/api/genie-templates/assets/file?url=' + encodeURIComponent(url);
}

function ArtImg({ url, className }: { url: string; className: string }) {
  const [src, setSrc] = useState(() => artUrl(url));
  useEffect(() => setSrc(artUrl(url)), [url]);
  return <img src={src} alt="" className={className} onError={() => { if (src !== url) setSrc(url); }}/>;
}

// Scaled drawing of a layout: background colour/image, numbered photo frames, overlay on top
export function LayoutPreview({ layout, width = 120 }: { layout: Layout; width?: number }) {
  const scale = width / layout.widthPx;
  return (
    <div className="relative overflow-hidden rounded border border-gray-200 flex-shrink-0" style={{ width, height: layout.heightPx * scale, backgroundColor: layout.backgroundColor }}>
      {layout.background && <ArtImg url={layout.background.url} className="absolute inset-0 w-full h-full object-cover"/>}
      {layout.slots.map(s => (
        <div key={s.id} className="absolute bg-gray-300/90 border border-white/70 flex items-center justify-center text-[10px] font-semibold text-gray-600"
          style={{ left: s.x * scale, top: s.y * scale, width: s.width * scale, height: s.height * scale, transform: `rotate(${s.rotationDegrees}deg)` }}>
          {s.shotIndex + 1}
        </div>
      ))}
      {layout.overlay && <ArtImg url={layout.overlay.url} className="absolute inset-0 w-full h-full"/>}
    </div>
  );
}

export function fmtDateTime(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
}

export function fmtDate(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
}
