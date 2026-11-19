'use client';
import { useState } from 'react';

// Glamour Style or Geniefied before/after on a guest session page: the finished design ("after") with the same design rendered
// without Glamour Style ("before", same pixel size) over it, revealed up to the slider. Drag anywhere on the photo or
// use the slider (keyboard too). Both images share one box and object-contain, so they line up.
export function BeforeAfter({ afterUrl, beforeUrl, alt, className, afterLabel = 'Glamour Style' }: { afterUrl: string; beforeUrl: string; alt: string; className: string; afterLabel?: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="space-y-2">
      <div className="relative select-none touch-pan-y">
        <img src={afterUrl} alt={alt} className={"block " + className} draggable={false}/>
        <img src={beforeUrl} alt="" aria-hidden className={'absolute inset-0 w-full h-full object-contain pointer-events-none ' + className}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false}/>
        <div className="absolute inset-y-0 w-0.5 bg-white/90 shadow pointer-events-none" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 text-xs">⇆</span>
        </div>
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-medium pointer-events-none">Original</span>
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-medium pointer-events-none">{afterLabel}</span>
        <input type="range" min={0} max={100} value={pos} onChange={e => setPos(Number(e.target.value))} aria-label={`Compare the original with ${afterLabel}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"/>
      </div>
      <p className="text-center text-xs text-gray-500">Slide to compare with the original</p>
    </div>
  );
}
