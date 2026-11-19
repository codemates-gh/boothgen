'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, RefreshCw, MessageSquare, Mail } from 'lucide-react';
import { fmtDateTime } from '@/components/genie/parts';

type Share = { id: string; channel: 'sms' | 'email'; destination: string; firstName: string | null; status: string; error: string | null; attempts: number; requestedAt: string; sentAt: string | null; deliveredAt: string | null; source: 'genie' | 'pcBooth'; boothName: string | null };
const STATUS: Record<string, { label: string; variant: any }> = {
  queued: { label: 'Sending', variant: 'info' }, sent: { label: 'Sent', variant: 'brand' }, delivered: { label: 'Delivered', variant: 'success' }, failed: { label: 'Failed', variant: 'danger' },
};

export default function GenieShares({ eventId, timeZone }: { eventId: string; timeZone: string }) {
  const [data, setData] = useState<{ shares: Share[]; counts: Record<string, number>; bySource?: { genie: number; pcBooth: number } } | null>(null);
  const [source, setSource] = useState<'' | 'genie' | 'pcBooth'>('');
  const [resending, setResending] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const r = await fetch(`/api/events/${eventId}/genie/shares`);
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { load(); }, [eventId]);

  async function resend(id: string) {
    setResending(id); setError('');
    const r = await fetch(`/api/events/${eventId}/genie/shares/${id}/resend`, { method: 'POST' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not resend');
    setResending(null);
    load();
  }

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Send className="w-4 h-4"/>Guest Texts &amp; Emails</CardTitle>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Refresh</Button>
        </div>
        {data && total > 0 && (
          <p className="text-sm text-gray-500">{total} total{data.bySource?.pcBooth ? ` (${data.bySource.genie} Genie booth, ${data.bySource.pcBooth} PC booth)` : ''} · {data.counts.delivered ?? 0} delivered · {data.counts.sent ?? 0} sent · {data.counts.queued ?? 0} sending · <span className={data.counts.failed ? 'text-[#E2445C] font-medium' : ''}>{data.counts.failed ?? 0} failed</span></p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {error && <p className="text-sm text-red-600 px-6 pb-3">{error}</p>}
        {!!data?.bySource?.pcBooth && (
          <div className="flex flex-wrap gap-2 px-6 pb-3">
            {([['', 'All'], ['genie', 'Genie booth'], ['pcBooth', 'PC booth']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSource(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${source === v ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{label}</button>
            ))}
          </div>
        )}
        {!data ? <p className="text-sm text-gray-400 px-6 pb-6">Loading…</p> : data.shares.length === 0 ? (
          <p className="text-sm text-gray-500 px-6 pb-6">No guest has asked for their photos by text or email yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr className="border-b">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Guest</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Requested</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3"></th>
              </tr></thead>
              <tbody>
                {data.shares.filter(s => !source || s.source === source).map(s => (
                  <tr key={s.id} className="border-b last:border-0 align-top">
                    <td className="px-6 py-3 text-sm">
                      <div className="flex items-center gap-2">{s.channel === 'sms' ? <MessageSquare className="w-3.5 h-3.5 text-gray-400"/> : <Mail className="w-3.5 h-3.5 text-gray-400"/>}<span className="font-medium">{s.destination}</span></div>
                      {s.firstName && <p className="text-xs text-gray-500 ml-5">{s.firstName}</p>}
                      {s.source === 'pcBooth' && <p className="text-xs text-gray-400 ml-5">PC booth{s.boothName ? ` · ${s.boothName}` : ''}</p>}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDateTime(s.requestedAt, timeZone)}</td>
                    <td className="px-6 py-3 text-sm">
                      <Badge variant={STATUS[s.status]?.variant ?? 'default'}>{STATUS[s.status]?.label ?? s.status}</Badge>
                      {s.attempts > 1 && <span className="text-xs text-gray-400 ml-2">attempt {s.attempts}</span>}
                      {s.status === 'failed' && s.error && <p className="text-xs text-[#E2445C] mt-1 break-words max-w-xs">{s.error}</p>}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {s.status === 'failed' && <Button variant="outline" size="sm" disabled={resending === s.id} onClick={() => resend(s.id)}>{resending === s.id ? 'Resending…' : 'Resend'}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
