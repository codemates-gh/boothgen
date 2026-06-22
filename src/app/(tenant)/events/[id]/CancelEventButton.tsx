'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Ban } from 'lucide-react';

type RefundOption = 'none' | 'deposit' | 'all';

interface Props {
  eventId: string;
  status: string;
  depositPaidCents: number;
  totalPaidCents: number;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(cents / 100);

export default function CancelEventButton({ eventId, status, depositPaidCents, totalPaidCents }: Props) {
  const [open, setOpen] = useState(false);
  const [refundOption, setRefundOption] = useState<RefundOption>('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  if (status === 'CANCELLED') return null;

  async function confirm() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/events/' + eventId + '/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundOption }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong');
      setLoading(false);
      return;
    }
    router.refresh();
    setOpen(false);
    setLoading(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="w-4 h-4 mr-1" />Cancel Event
      </Button>
    );
  }

  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3 w-full sm:w-auto min-w-[280px]">
      <p className="text-sm font-semibold text-red-700">Cancel this event?</p>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="refund"
            value="none"
            checked={refundOption === 'none'}
            onChange={() => setRefundOption('none')}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">No refund</span>
            <span className="block text-gray-500 text-xs">Keep all collected payments</span>
          </span>
        </label>

        <label className={`flex items-start gap-2 ${depositPaidCents > 0 ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
          <input
            type="radio"
            name="refund"
            value="deposit"
            checked={refundOption === 'deposit'}
            onChange={() => setRefundOption('deposit')}
            disabled={depositPaidCents === 0}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Refund deposit</span>
            {depositPaidCents > 0
              ? <span className="block text-gray-500 text-xs">Return {fmt(depositPaidCents)} to client</span>
              : <span className="block text-gray-500 text-xs">No deposit collected</span>}
          </span>
        </label>

        <label className={`flex items-start gap-2 ${totalPaidCents > 0 ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
          <input
            type="radio"
            name="refund"
            value="all"
            checked={refundOption === 'all'}
            onChange={() => setRefundOption('all')}
            disabled={totalPaidCents === 0}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Refund all payments</span>
            {totalPaidCents > 0
              ? <span className="block text-gray-500 text-xs">Return {fmt(totalPaidCents)} to client</span>
              : <span className="block text-gray-500 text-xs">No payments collected</span>}
          </span>
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={confirm} disabled={loading}>
          {loading ? 'Cancelling…' : 'Confirm Cancellation'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); setError(''); }}>
          Keep Event
        </Button>
      </div>
    </div>
  );
}
