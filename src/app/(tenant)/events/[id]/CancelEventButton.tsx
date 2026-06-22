'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Ban } from 'lucide-react';

export default function CancelEventButton({ eventId, status }: { eventId: string; status: string }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (status === 'CANCELLED') return null;

  async function cancel() {
    setLoading(true);
    await fetch('/api/events/' + eventId + '/cancel', { method: 'POST' });
    router.refresh();
    setLoading(false);
    setConfirm(false);
  }

  if (!confirm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
        <Ban className="w-4 h-4 mr-1" />Cancel Event
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-red-600 font-medium">Mark as cancelled?</span>
      <Button variant="destructive" size="sm" onClick={cancel} disabled={loading}>
        {loading ? 'Cancelling…' : 'Yes, Cancel'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>Keep</Button>
    </div>
  );
}
