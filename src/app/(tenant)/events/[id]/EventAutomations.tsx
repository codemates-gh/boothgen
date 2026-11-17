'use client';
// Automated emails for this event: what's scheduled (skip one if it shouldn't go out), what went out, and the
// date-based automations that start once the event is booked
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

export interface EventAutomationRow {
  id: string;
  name: string;           // automation name
  template: string | null;
  status: 'SCHEDULED' | 'SENT' | 'FAILED' | 'SKIPPED';
  scheduledFor: string;
  executedAt: string | null;
  skippedHere: boolean;   // skipped from this page (can be brought back while still in the future)
}

const BADGE: Record<EventAutomationRow['status'], [string, string]> = {
  SCHEDULED: ['Scheduled', 'info'], SENT: ['Sent', 'success'], FAILED: ['Failed', 'danger'], SKIPPED: ['Skipped', 'default'],
};

export default function EventAutomations({ eventId, rows, onceBooked }: { eventId: string; rows: EventAutomationRow[]; onceBooked: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function act(id: string, action: 'skip' | 'restore') {
    setBusy(id); setError('');
    const res = await fetch(`/api/events/${eventId}/automations/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Something went wrong');
    setBusy(null);
    router.refresh();
  }

  const now = Date.now();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4"/>Automated Emails</CardTitle>
          <Link href="/messages/automations" className="text-xs font-medium text-gray-500 hover:text-[#1F1F3D]">Manage automations</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && onceBooked.length === 0 && (
          <p className="text-sm text-gray-500">Nothing scheduled for this event. Set up automated emails in <Link href="/messages/automations" className="text-[#0085FF] hover:underline">Messages → Automations</Link>.</p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {rows.map(r => {
              const [label, variant] = BADGE[r.status];
              const when = r.status === 'SENT' && r.executedAt ? r.executedAt : r.scheduledFor;
              const future = new Date(r.scheduledFor).getTime() > now;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={'font-medium ' + (r.status === 'SKIPPED' ? 'text-gray-400 line-through' : 'text-[#1F1F3D]')}>{r.template ?? r.name}</p>
                    <p className="text-xs text-gray-400">{r.name} · {r.status === 'SENT' ? 'sent' : r.status === 'SCHEDULED' ? 'sends' : r.status === 'SKIPPED' ? 'was set for' : 'failed,'} {format(new Date(when), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                  <Badge variant={variant as any}>{label}</Badge>
                  {r.status === 'SCHEDULED' && (
                    <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'skip')}>{busy === r.id ? '…' : 'Skip'}</Button>
                  )}
                  {r.status === 'SKIPPED' && r.skippedHere && future && (
                    <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'restore')}>{busy === r.id ? '…' : 'Undo skip'}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {onceBooked.length > 0 && (
          <p className="text-xs text-gray-500">Once this event is booked: {onceBooked.join(', ')}.</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
