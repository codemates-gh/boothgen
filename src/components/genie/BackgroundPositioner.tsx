'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Move } from 'lucide-react';
import type { Layout } from '@/components/genie/parts';
import type { BackgroundFocus } from './layoutImage';

// Template designer → Background image of another shape: shows it covering the layout (behind the photo frames) and
// lets the operator drag it to choose which part shows. Apply returns where it sits (0–1 along the side that overflows).
export function BackgroundPositioner({ open, src, size, layout, initial, busy, onApply, onClose }: {
  open: boolean; src: string | null; size: { width: number; height: number } | null; layout: Layout;
  initial?: BackgroundFocus; busy?: boolean;
  onApply: (focus: BackgroundFocus) => void; onClose: () => void;
}) {
  const [focus, setFocus] = useState<BackgroundFocus>(initial ?? { x: 0.5, y: 0.5 });
  const drag = useRef<{ x: number; y: number; focus: BackgroundFocus } | null>(null);
  useEffect(() => { if (open) setFocus(initial ?? { x: 0.5, y: 0.5 }); }, [open, src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src || !size) return null;
  // Frame at the layout's shape, fitting the window; the image at cover scale behind it
  // (at most half the screen tall, so the buttons stay in view on small screens)
  const maxH = Math.min(420, typeof window === 'undefined' ? 420 : Math.max(200, window.innerHeight * 0.5));
  const frameW = Math.min(560, maxH * layout.widthPx / layout.heightPx), scale = frameW / layout.widthPx, frameH = layout.heightPx * scale;
  const k = Math.max(frameW / size.width, frameH / size.height);
  const imgW = size.width * k, imgH = size.height * k;
  const overX = imgW - frameW, overY = imgH - frameH; // how far it can move each way (px on screen)
  const horizontal = overX > overY;

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const fx = overX > 0.5 ? Math.min(1, Math.max(0, d.focus.x - (e.clientX - d.x) / overX)) : 0.5;
    const fy = overY > 0.5 ? Math.min(1, Math.max(0, d.focus.y - (e.clientY - d.y) / overY)) : 0.5;
    setFocus({ x: fx, y: fy });
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Position the Background" className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">The image is a different shape from the layout, so part of it is trimmed. Drag it {horizontal ? 'left or right' : 'up or down'} to choose what shows behind the photos.</p>
      <div className="flex justify-center bg-[#F5F6F8] rounded-lg p-4 select-none">
        <div className="relative overflow-hidden shadow-md touch-none cursor-grab active:cursor-grabbing" style={{ width: frameW, height: frameH, backgroundColor: layout.backgroundColor }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, focus }; }}
          onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ width: imgW, height: imgH, left: -overX * focus.x, top: -overY * focus.y }}/>
          {layout.slots.map(s => (
            <div key={s.id} className="absolute border-2 border-dashed border-white/90 bg-white/25 pointer-events-none"
              style={{ left: s.x * scale, top: s.y * scale, width: s.width * scale, height: s.height * scale, transform: `rotate(${s.rotationDegrees}deg)` }}/>
          ))}
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/55 text-white text-[11px] px-1.5 py-0.5 pointer-events-none"><Move className="w-3 h-3"/>Drag</div>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-5">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setFocus({ x: 0.5, y: 0.5 })}>Centre</Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => onApply(focus)}>{busy ? 'Uploading…' : 'Use Background'}</Button>
        </div>
      </div>
    </Modal>
  );
}
