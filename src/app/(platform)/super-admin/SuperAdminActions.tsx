'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function SuperAdminActions({ tenantId, tenantName, eventCount }: { tenantId: string; tenantName: string; eventCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function deleteTenant() {
    setDeleting(true);
    await fetch('/api/super-admin/tenants/' + tenantId, { method: 'DELETE' });
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">Delete "{tenantName}"?{eventCount > 0 ? ' (' + eventCount + ' events will be deleted)' : ''}</span>
        <Button size="sm" variant="destructive" onClick={deleteTenant} disabled={deleting}>{deleting ? 'Deleting...' : 'Confirm'}</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
      <Trash2 className="w-4 h-4"/>
    </Button>
  );
}
