'use client';
import { RotateCcw, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DIRECTIONS, SPEED_MAX, SPEED_MIN, TRANSITIONS, type Segment } from '@/lib/genie/spin360Options';

// Genie 360 speed ramps: the drawing on style cards and the editor (event → Advanced, Super Admin → Genie 360)

// A simple drawing of a speed ramp: each piece as wide as it plays, as tall as it's fast, rewinds in amber
export function RampDrawing({ segments, className = 'h-10' }: { segments: Segment[]; className?: string }) {
  const out = segments.map(s => (s.to - s.from) / ((s.speedStart + s.speedEnd) / 2));
  const total = out.reduce((a, b) => a + b, 0) || 1;
  const h = (speed: number) => 4 + 32 * (Math.log2(speed) - Math.log2(SPEED_MIN)) / (Math.log2(SPEED_MAX) - Math.log2(SPEED_MIN));
  let x = 0;
  return (
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={'w-full ' + className} aria-hidden>
      {segments.map((s, i) => {
        const w = 200 * out[i] / total, x0 = x; x += w;
        return <polygon key={i} points={`${x0},40 ${x0},${40 - h(s.speedStart)} ${x0 + w},${40 - h(s.speedEnd)} ${x0 + w},40`}
          className={s.direction === 'reverse' ? 'fill-amber-400' : 'fill-brand/70'} stroke="white" strokeWidth="1"/>;
      })}
    </svg>
  );
}

export function RampEditor({ segments, onChange, onReset, disabled }: { segments: Segment[]; onChange: (s: Segment[]) => void; onReset?: () => void; disabled?: boolean }) {
  const set = (i: number, p: Partial<Segment>) => onChange(segments.map((s, j) => j === i ? { ...s, ...p } : s));
  const num = (v: string) => Math.round(Number(v) * 1000) / 1000;
  return (
    <div className="space-y-2">
      <RampDrawing segments={segments}/>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead><tr className="text-xs text-gray-500 text-left">
            <th className="font-normal pr-2">Piece of the spin (0–1)</th><th className="font-normal pr-2">Direction</th><th className="font-normal pr-2">Speed from → to</th><th className="font-normal pr-2">Into it</th><th/>
          </tr></thead>
          <tbody>
            {segments.map((s, i) => (
              <tr key={i}>
                <td className="pr-2 py-1 whitespace-nowrap"><Input type="number" className="w-20 inline-block" min={0} max={1} step={0.05} value={s.from} disabled={disabled} onChange={e => set(i, { from: num(e.target.value) })}/> – <Input type="number" className="w-20 inline-block" min={0} max={1} step={0.05} value={s.to} disabled={disabled} onChange={e => set(i, { to: num(e.target.value) })}/></td>
                <td className="pr-2 py-1"><Select value={s.direction} disabled={disabled} onChange={e => set(i, { direction: e.target.value as Segment['direction'] })}>{DIRECTIONS.map(d => <option key={d} value={d}>{d === 'forward' ? 'Forward' : 'Rewind'}</option>)}</Select></td>
                <td className="pr-2 py-1 whitespace-nowrap"><Input type="number" className="w-20 inline-block" min={SPEED_MIN} max={SPEED_MAX} step={0.125} value={s.speedStart} disabled={disabled} onChange={e => set(i, { speedStart: num(e.target.value) })}/>× → <Input type="number" className="w-20 inline-block" min={SPEED_MIN} max={SPEED_MAX} step={0.125} value={s.speedEnd} disabled={disabled} onChange={e => set(i, { speedEnd: num(e.target.value) })}/>×</td>
                <td className="pr-2 py-1"><Select value={s.transition} disabled={disabled} onChange={e => set(i, { transition: e.target.value as Segment['transition'] })}>{TRANSITIONS.map(t => <option key={t} value={t}>{t === 'cut' ? 'Cut' : t === 'flash' ? 'Flash' : 'Blur'}</option>)}</Select></td>
                <td className="py-1">{!disabled && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" disabled={segments.length === 1} onClick={() => onChange(segments.filter((_, j) => j !== i))} aria-label="Remove"><X className="w-4 h-4"/></Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={segments.length >= 12} onClick={() => onChange([...segments, { from: 0, to: 1, direction: 'forward', speedStart: 1, speedEnd: 1, transition: 'cut' }])}>Add a piece</Button>
          {onReset && <Button type="button" size="sm" variant="ghost" onClick={onReset}><RotateCcw className="w-3.5 h-3.5 mr-1"/>Reset to style</Button>}
        </div>
      )}
      <p className="text-xs text-gray-500">Speeds under 1× are slow motion (0.25× is 4× slower); over 1× is fast. Rewind plays that piece backwards.</p>
    </div>
  );
}

