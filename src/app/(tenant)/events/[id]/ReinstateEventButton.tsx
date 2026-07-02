'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface Props {
  eventId: string;
  status: string;
}

export default function ReinstateEventButton({ eventId, status }: Props) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const router = useRouter();

  if (!['ARCHIVED', 'LOST'].includes(status)) return null;

  async function confirm() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/events/' + eventId + '/reinstate', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong');
      setLoading(false);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="w-4 h-4 mr-1" />Reinstate Event
      </Button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3 w-full sm:w-auto min-w-[280px]">
      <p className="text-sm font-semibold text-gray-700">Reinstate this event?</p>
      <p className="text-xs text-gray-500">
        {status === 'ARCHIVED'
          ? 'This will restore the event to BOOKED status so it becomes active again.'
          : 'This will restore the event to LEAD status so you can continue working on it.'}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={confirm} disabled={loading}>
          {loading ? 'Reinstating…' : 'Confirm'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); setError(''); }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
