
'use client';
import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props { onCapture: (dataUrl: string) => void; className?: string; }

export function SignatureCanvas({ onCapture, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); setDrawing(true); setHasDrawn(true);
    const pos = getPos(e); last.current = pos;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return; e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    last.current = pos;
  }

  function stop() {
    if (!drawing) return; setDrawing(false);
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    onCapture(dataUrl);
  }

  function clear() {
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height); setHasDrawn(false); onCapture('');
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 h-32">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg touch-none" onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
        {!hasDrawn && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-gray-400 text-sm">Draw your signature here</p></div>}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasDrawn}>Clear</Button>
    </div>
  );
}
