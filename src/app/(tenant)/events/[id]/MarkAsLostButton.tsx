'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

interface Props {
  eventId: string;
  status: string;
}

export default function MarkAsLostButton({ eventId, status }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Only show for pre-booking statuses
  if (!['LEAD', 'QUOTED'].includes(status)) return null;

  async function confirm() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/events/' + eventId + '/lost', { method: 'POST' });
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
        <XCircle className="w-4 h-4 mr-1" />Mark as Lost
      </Button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3 w-full sm:w-auto min-w-[280px]">
      <p className="text-sm font-semibold text-gray-700">Mark this event as lost?</p>
      <p className="text-xs text-gray-500">Use this when a lead or quote didn't convert — the client didn't book. No refunds are processed.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="border-gray-400 text-gray-700 hover:bg-gray-100" onClick={confirm} disabled={loading}>
          {loading ? 'Saving…' : 'Confirm Lost'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); setError(''); }}>
          Keep Active
        </Button>
      </div>
    </div>
  );
}
