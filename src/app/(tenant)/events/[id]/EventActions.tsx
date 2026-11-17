'use client';
// Event state actions (mark lost, cancel, reinstate, complete, archive, duplicate, delete): the "•••" menu in the
// page header and the buttons in the workflow banner. Each action confirms in a dialog before it runs.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { fmtCents } from '@/lib/utils';
import { Archive, Ban, CheckCircle, Copy, MoreHorizontal, RotateCcw, Trash2, XCircle } from 'lucide-react';

type Dialog = 'lost' | 'cancel' | 'reinstate' | 'complete' | 'archive' | 'duplicate' | 'delete';

export interface EventActionProps {
  eventId: string;
  status: string;
  isPast: boolean;
  hasPhotos: boolean;
  hasInvoices: boolean;
  hasContracts: boolean;
  depositPaidCents: number;
  totalPaidCents: number;
  currency: string;
}

const canMarkLost = (s: string) => ['LEAD', 'QUOTED'].includes(s);

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

function ActionDialog({ dialog, onClose, p }: { dialog: Dialog | null; onClose: () => void; p: EventActionProps }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refund, setRefund] = useState<'none' | 'deposit' | 'all'>('none');
  useEffect(() => { setError(''); setLoading(false); setRefund('none'); }, [dialog]);

  async function run(fn: () => Promise<void>) {
    setLoading(true); setError('');
    try { await fn(); } catch (e: any) { setError(e.message); setLoading(false); }
  }
  const done = () => { router.refresh(); onClose(); };

  const copy: Record<Dialog, { title: string; body: React.ReactNode; confirm: string; danger?: boolean; go: () => Promise<void> }> = {
    lost: {
      title: 'Mark this event as lost?',
      body: <p>Use this when a lead or quote didn&apos;t convert and the client didn&apos;t book. No refunds are processed.</p>,
      confirm: 'Mark as Lost',
      go: async () => { await post(`/api/events/${p.eventId}/lost`); done(); },
    },
    cancel: {
      title: 'Cancel this event?',
      danger: true,
      body: (
        <div className="space-y-2">
          {([
            ['none', 'No refund', 'Keep all collected payments', true],
            ['deposit', 'Refund deposit', p.depositPaidCents > 0 ? `Return ${fmtCents(p.depositPaidCents, p.currency)} to the client` : 'No deposit collected', p.depositPaidCents > 0],
            ['all', 'Refund all payments', p.totalPaidCents > 0 ? `Return ${fmtCents(p.totalPaidCents, p.currency)} to the client` : 'No payments collected', p.totalPaidCents > 0],
          ] as const).map(([value, label, hint, enabled]) => (
            <label key={value} className={`flex items-start gap-2 ${enabled ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
              <input type="radio" name="refund" checked={refund === value} disabled={!enabled} onChange={() => setRefund(value)} className="mt-1" />
              <span><span className="font-medium text-gray-800">{label}</span><span className="block text-xs text-gray-500">{hint}</span></span>
            </label>
          ))}
        </div>
      ),
      confirm: 'Cancel Event',
      go: async () => { await post(`/api/events/${p.eventId}/cancel`, { refundOption: refund }); done(); },
    },
    reinstate: {
      title: 'Reinstate this event?',
      body: <p>{p.status === 'ARCHIVED' ? 'The event goes back to Booked so it becomes active again.' : 'The event goes back to Lead so you can keep working on it.'}</p>,
      confirm: 'Reinstate',
      go: async () => { await post(`/api/events/${p.eventId}/reinstate`); done(); },
    },
    complete: {
      title: 'Mark this event as completed?',
      body: <p>Use this once the event has happened.</p>,
      confirm: 'Mark Complete',
      go: async () => { await post(`/api/events/${p.eventId}/complete`); done(); },
    },
    archive: {
      title: 'Archive this event?',
      body: <p>This marks the event as fully closed out. You can reinstate it later.</p>,
      confirm: 'Archive',
      go: async () => { await post(`/api/events/${p.eventId}/close`); done(); },
    },
    duplicate: {
      title: 'Duplicate this event?',
      body: <p>Creates a new Lead for the same client with the same venue, times, package and guest count. Quotes, invoices, contracts, notes and photos aren&apos;t copied, and the client isn&apos;t emailed. You&apos;ll go to the new event&apos;s edit page to set its date.</p>,
      confirm: 'Duplicate',
      go: async () => { const e = await post(`/api/events/${p.eventId}/duplicate`); router.push(`/events/${e.id}/edit`); },
    },
    delete: {
      title: 'Delete this event?',
      danger: true,
      body: <p>This permanently deletes the event, its notes, checklist and photos. It can&apos;t be undone.</p>,
      confirm: 'Delete Event',
      go: async () => {
        const res = await fetch(`/api/events/${p.eventId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not delete the event');
        router.push('/events');
      },
    },
  };
  if (!dialog) return null;
  const d = copy[dialog];
  return (
    <Modal open onClose={onClose} title={d.title}>
      <div className="space-y-4 text-sm text-gray-600">
        {d.body}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Go back</Button>
          <Button variant={d.danger ? 'destructive' : 'default'} onClick={() => run(d.go)} disabled={loading}>{loading ? 'Working…' : d.confirm}</Button>
        </div>
      </div>
    </Modal>
  );
}

// The "•••" More Actions menu in the page header
export function EventActionsMenu(p: EventActionProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
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

  const pick = (d: Dialog) => { setOpen(false); setDialog(d); };
  const deleteBlocked = p.hasInvoices || p.hasContracts;
  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F5F6F8] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <div role="menu" className={'absolute z-30 ' + (alignRight ? 'right-0' : 'left-0') + ' mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-card-md'}>
          <button role="menuitem" className={item} onClick={() => pick('duplicate')}><Copy className="w-4 h-4 text-gray-400" />Duplicate Event</button>
          <div className="my-1 border-t border-gray-100" />
          {['BOOKED', 'IN_PROGRESS'].includes(p.status) && p.isPast && (
            <button role="menuitem" className={item} onClick={() => pick('complete')}><CheckCircle className="w-4 h-4 text-gray-400" />Mark Complete</button>
          )}
          {p.status === 'COMPLETED' && (
            <button role="menuitem" className={item} disabled={!p.hasPhotos} title={p.hasPhotos ? undefined : 'Upload event photos to archive'} onClick={() => pick('archive')}>
              <Archive className="w-4 h-4 text-gray-400" />{p.hasPhotos ? 'Archive Event' : 'Archive (upload photos first)'}
            </button>
          )}
          {['ARCHIVED', 'LOST'].includes(p.status) && (
            <button role="menuitem" className={item} onClick={() => pick('reinstate')}><RotateCcw className="w-4 h-4 text-gray-400" />Reinstate Event</button>
          )}
          {canMarkLost(p.status) && (
            <button role="menuitem" className={item} onClick={() => pick('lost')}><XCircle className="w-4 h-4 text-gray-400" />Mark as Lost</button>
          )}
          {p.status !== 'CANCELLED' && (
            <button role="menuitem" className={item + ' text-red-600'} onClick={() => pick('cancel')}><Ban className="w-4 h-4" />Cancel Event</button>
          )}
          <button role="menuitem" className={item + ' text-red-600'} disabled={deleteBlocked}
            title={deleteBlocked ? `Delete this event's ${p.hasInvoices && p.hasContracts ? 'invoices and contracts' : p.hasInvoices ? 'invoices' : 'contracts'} first` : undefined}
            onClick={() => pick('delete')}>
            <Trash2 className="w-4 h-4" />Delete Event
          </button>
        </div>
      )}
      <ActionDialog dialog={dialog} onClose={() => setDialog(null)} p={p} />
    </div>
  );
}

// "Mark as Lost" button and "Cancel Event" link for the workflow banner
export function BannerStateActions(p: EventActionProps) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  return (
    <>
      {canMarkLost(p.status) && (
        <Button variant="outline" size="sm" onClick={() => setDialog('lost')}><XCircle className="w-3.5 h-3.5 mr-1.5" />Mark as Lost</Button>
      )}
      <button className="text-xs font-medium text-gray-500 hover:text-red-600 px-1" onClick={() => setDialog('cancel')}>Cancel Event</button>
      <ActionDialog dialog={dialog} onClose={() => setDialog(null)} p={p} />
    </>
  );
}
