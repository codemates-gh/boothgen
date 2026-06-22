'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, Loader2 } from 'lucide-react';

interface Member { id: string; name: string; email: string; }

export default function AssignEventButton({
  eventId,
  currentAssigneeId,
  members,
}: {
  eventId: string;
  currentAssigneeId: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(currentAssigneeId ?? '');

  async function onChange(userId: string) {
    setValue(userId);
    setSaving(true);
    await fetch(`/api/events/${eventId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId || null }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <UserCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white disabled:opacity-50 truncate"
      >
        <option value="">Unassigned</option>
        {members.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
    </div>
  );
}
