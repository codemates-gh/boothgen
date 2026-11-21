'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Pencil, Tablet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { deviceDetails, deviceLabel, isGenericName } from '@/lib/genie/ipadModels';
import { fmtDateTime } from '@/components/genie/parts';

type Available = { id: string; name: string; model: string | null; appVersion: string | null; lastSeenAt: string | null };
type Row = { id: string; name: string; model: string | null; appVersion: string | null; lastSeenAt: string | null; revokedAt: string | null; assignedAt: string; releasedAt: string | null };

export default function GenieEventDevices({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{ maxDevices: number; used: number; devices: Row[]; available: Available[] } | null>(null);
  const [confirm, setConfirm] = useState<{ row: Row; action: 'release' | 'allow' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Naming a device here is the same as Genie → Devices → Rename (iPadOS only tells apps "iPad")
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState('');

  async function rename() {
    if (!renaming) return;
    setBusy(true); setRenameError('');
    const r = await fetch(`/api/genie-devices/${renaming.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renaming.name }) });
    setBusy(false);
    if (!r.ok) { setRenameError((await r.json().catch(() => ({}))).error || 'Could not rename'); return; }
    setRenaming(null);
    load();
  }
  const renameButton = (d: { id: string; name: string }) => (
    <Button variant="ghost" size="sm" onClick={() => { setRenaming({ id: d.id, name: isGenericName(d.name) ? '' : d.name }); setRenameError(''); }}>
      <Pencil className="w-3.5 h-3.5 mr-1"/>Rename
    </Button>
  );

  async function load() {
    const r = await fetch(`/api/events/${eventId}/genie/devices`);
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { load(); }, [eventId]);

  async function act() {
    if (!confirm) return;
    setBusy(true); setError('');
    const r = await fetch(`/api/events/${eventId}/genie/devices`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: confirm.row.id, action: confirm.action }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Something went wrong'); return; }
    setConfirm(null);
    load();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Tablet className="w-4 h-4"/>Devices on This Event</CardTitle>
          {data && <Badge variant={data.used >= data.maxDevices ? 'warning' : 'default'}>{data.used} of {data.maxDevices}</Badge>}
        </div>
        <p className="text-sm text-gray-500">Any paired device can open this event from its event list; it takes a spot when it does. Release one to free its spot for another device. <Link href="/genie/devices" className="text-brand hover:underline">Manage devices</Link></p>
      </CardHeader>
      <CardContent>
        {!data ? <p className="text-sm text-gray-400">Loading…</p> : data.devices.length === 0 ? (
          data.available.length === 0 && <p className="text-sm text-gray-500">No devices are paired yet. <Link href="/genie/devices" className="text-brand hover:underline">Pair a device</Link></p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.devices.map(d => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium flex items-center gap-2">{deviceLabel(d)}
                    {d.revokedAt ? <Badge variant="danger">Removed</Badge> : d.releasedAt ? <Badge variant="default">Released</Badge> : <Badge variant="success">Active</Badge>}
                  </p>
                  <p className="text-xs text-gray-500">{deviceDetails(d).join(' · ')}{d.lastSeenAt ? ' · last seen ' + fmtDateTime(d.lastSeenAt) : ''}</p>
                </div>
                {!d.revokedAt && renameButton(d)}
                {!d.revokedAt && (d.releasedAt
                  ? <Button variant="outline" size="sm" onClick={() => setConfirm({ row: d, action: 'allow' })}>Allow Again</Button>
                  : <Button variant="outline" size="sm" onClick={() => setConfirm({ row: d, action: 'release' })}>Release</Button>)}
              </li>
            ))}
          </ul>
        )}
        {data && data.available.length > 0 && (
          <div className={data.devices.length > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Available</p>
            <ul className="divide-y divide-gray-100">
              {data.available.map(d => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium flex items-center gap-2">{deviceLabel(d)}<Badge variant="default">Not on this event yet</Badge></p>
                    <p className="text-xs text-gray-500">{deviceDetails(d).join(' · ')}{d.lastSeenAt ? ' · last seen ' + fmtDateTime(d.lastSeenAt) : ''}</p>
                  </div>
                  {renameButton(d)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-1">
              {data.used >= data.maxDevices ? `All ${data.maxDevices} spots are taken. Release a device above before another one opens this event.` : 'Open this event in Genie on the device to start using it here.'}
            </p>
          </div>
        )}
      </CardContent>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.action === 'release' ? 'Release iPad' : 'Allow iPad Again'}>
        <p className="text-sm text-gray-600 mb-5">
          {confirm?.action === 'release'
            ? <><span className="font-medium text-gray-800">{confirm && deviceLabel(confirm.row)}</span> will stop receiving updates for this event and its spot opens for another iPad. Photos it already took still upload.</>
            : <><span className="font-medium text-gray-800">{confirm && deviceLabel(confirm.row)}</span> can load this event again if a spot is free.</>}
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.action === 'release' ? 'destructive' : 'default'} disabled={busy} onClick={act}>{busy ? 'Working…' : confirm?.action === 'release' ? 'Release' : 'Allow'}</Button>
        </div>
      </Modal>
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename iPad">
        <form onSubmit={e => { e.preventDefault(); rename(); }} className="space-y-4">
          <p className="text-sm text-gray-600">A name you&apos;ll recognize, e.g. &ldquo;Booth 1&rdquo; or &ldquo;Front iPad&rdquo;. iPads only tell apps they&apos;re an &ldquo;iPad&rdquo;, so until you name one it shows its model.</p>
          <Input autoFocus value={renaming?.name ?? ''} maxLength={80} placeholder="Booth 1" onChange={e => setRenaming(r => r && { ...r, name: e.target.value })}/>
          {renameError && <p className="text-sm text-red-600">{renameError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" disabled={busy || !renaming?.name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
