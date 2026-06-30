'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function MarkCompleteButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleComplete() {
    if (!confirm('Mark this event as Completed?')) return;
    setLoading(true);
    await fetch(`/api/events/${eventId}/complete`, { method: 'POST' });
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleComplete} disabled={loading}>
      <CheckCircle className="w-4 h-4 mr-1" />
      {loading ? 'Saving…' : 'Mark Complete'}
    </Button>
  );
}
