'use client';
// The "•••" overflow menu used in page headers (event, quote, invoice, contract): secondary and destructive actions
// live here so the header keeps to one row of main buttons.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from './button';

export type MoreMenuItem =
  | 'divider'
  | {
      label: string;
      icon: LucideIcon;
      href?: string;          // a link (external ones open in a new tab)
      external?: boolean;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
      title?: string;
    };

export function MoreMenu({ items }: { items: (MoreMenuItem | false | null | undefined | '')[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Open toward whichever side has room: on phones the button sits on the left, on wide screens at the right edge
  const [alignRight, setAlignRight] = useState(true);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAlignRight(r.right - 224 >= 8);
    setOpen(o => !o);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const list = items.filter(Boolean) as MoreMenuItem[];
  // No dividers at the ends or doubled up when items are left out
  const shown = list.filter((it, i) => it !== 'divider' || (i > 0 && i < list.length - 1 && list[i - 1] !== 'divider'));
  if (shown.length === 0) return null;
  const cls = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F5F6F8] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <div role="menu" className={'absolute z-30 ' + (alignRight ? 'right-0' : 'left-0') + ' mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-card-md'}>
          {shown.map((it, i) => {
            if (it === 'divider') return <div key={'d' + i} className="my-1 border-t border-gray-100" />;
            const Icon = it.icon;
            const body = <><Icon className={'w-4 h-4 ' + (it.danger ? '' : 'text-gray-400')} />{it.label}</>;
            const c = cls + (it.danger ? ' text-red-600' : '');
            if (it.href && !it.disabled) {
              return it.external
                ? <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" className={c} onClick={() => setOpen(false)}>{body}</a>
                : <Link key={it.label} role="menuitem" href={it.href} className={c} onClick={() => setOpen(false)}>{body}</Link>;
            }
            return (
              <button key={it.label} role="menuitem" className={c} disabled={it.disabled} title={it.title}
                onClick={() => { setOpen(false); it.onClick?.(); }}>
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
