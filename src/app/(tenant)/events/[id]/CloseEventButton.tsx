'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Archive, AlertCircle } from 'lucide-react';

interface Props {
  eventId: string;
  hasPhotos: boolean;
}

export default function CloseEventButton({ eventId, hasPhotos }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClose() {
    if (!confirm('Archive this event? This marks it as fully closed out.')) return;
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/close`, { method: 'POST' });
    if (res.ok) {
      router.refresh();
    } else {
      alert('Could not archive — please upload event photos first.');
      setLoading(false);
    }
  }

  if (!hasPhotos) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Upload event photos to archive</span>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClose} disabled={loading}>
      <Archive className="w-4 h-4 mr-1" />
      {loading ? 'Archiving…' : 'Archive Event'}
    </Button>
  );
}
