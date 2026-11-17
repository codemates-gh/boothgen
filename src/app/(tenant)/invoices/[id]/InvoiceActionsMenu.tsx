'use client';
// "•••" menu in the invoice header: PDF, the event, and Delete (confirmed in a dialog)
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MoreMenu } from '@/components/ui/MoreMenu';

export default function InvoiceActionsMenu({ invoiceId, invoiceNumber, eventId, canDelete }: { invoiceId: string; invoiceNumber: string; eventId: string | null; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true); setError('');
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
    if (res.ok) { router.push('/invoices'); return; }
    setDeleting(false);
    setError((await res.json().catch(() => ({}))).error ?? 'Could not delete the invoice.');
  }

  return (
    <>
      <MoreMenu items={[
        { label: 'Download PDF', icon: Download, href: `/api/invoices/${invoiceId}/pdf`, external: true },
        eventId && { label: 'View Event', icon: Calendar, href: `/events/${eventId}` },
        canDelete && 'divider',
        canDelete && { label: 'Delete Invoice', icon: Trash2, danger: true, onClick: () => setConfirming(true) },
      ]} />
      <Modal open={confirming} onClose={() => setConfirming(false)} title={`Delete ${invoiceNumber}?`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This permanently deletes the invoice and its payment schedule. This cannot be undone.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete Invoice'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
