'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function DeleteEventButton({ eventId, hasInvoices, hasContracts }: { eventId: string; hasInvoices: boolean; hasContracts: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const blocked = hasInvoices || hasContracts;
  const blockedReason = hasInvoices && hasContracts ? 'invoices and contracts' : hasInvoices ? 'invoices' : 'contracts';

  if (blocked) {
    return <Button variant="ghost" size="sm" className="text-gray-300 cursor-not-allowed" title={'Delete ' + blockedReason + ' first'} disabled><Trash2 className="w-4 h-4"/></Button>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">Delete this event?</span>
        <Button size="sm" variant="destructive" onClick={async () => { setDeleting(true); await fetch('/api/events/' + eventId, { method: 'DELETE' }); router.push('/events'); }} disabled={deleting}>{deleting ? '...' : 'Yes'}</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>No</Button>
      </div>
    );
  }

  return <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => setConfirming(true)}><Trash2 className="w-4 h-4"/></Button>;
}
