'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Sparkles, Tablet, KeyRound, Plus, Pencil, Trash2, HardDrive, Lock } from 'lucide-react';

type Device = {
  id: string; name: string; model: string | null; appVersion: string | null; prefix: string; lastSeenAt: string | null; createdAt: string;
  storageFreeBytes: number | null; storageTotalBytes: number | null; lowStorage: boolean;
  currentEvent: { id: string; title: string; eventDate: string } | null; eventCount: number;
};
type Data = { devices: Device[]; pairingCode: { code: string; expiresAt: string } | null; pinSet: boolean };

const GB = 1024 ** 3;
function fmtGB(n: number) { return (n / GB).toFixed(n < 10 * GB ? 1 : 0) + ' GB'; }

function ago(iso: string | null) {
  if (!iso) return 'Never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'Just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(expiresAt).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) { clearInterval(t); onExpire(); }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  const s = Math.max(0, Math.ceil(left / 1000));
  return <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function GenieDevicesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/genie-devices');
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);
  // Pick up an iPad pairing while the code is on screen
  useEffect(() => { if (!data?.pairingCode) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [data?.pairingCode, load]);

  async function createCode() {
    setCreating(true); setError('');
    const r = await fetch('/api/genie-devices/pairing-code', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setCreating(false);
    if (!r.ok) { setError(d.error || 'Could not create a code'); return; }
    setData(prev => prev && ({ ...prev, pairingCode: d }));
  }

  async function submit(url: string, init: RequestInit, done: () => void) {
    setBusy(true); setModalError('');
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setModalError(d.error || 'Something went wrong'); return; }
    done();
    load();
  }

  const expire = useCallback(() => setData(prev => prev && ({ ...prev, pairingCode: null })), []);

  return (
    <>
      <TopBar title="Genie iPads"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
        {notEnabled ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
              <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
              <p className="text-sm">Genie runs your iPad photo booth and texts or emails guests their photos. Contact support to enable it for your account.</p>
            </CardContent>
          </Card>
        ) : !data ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Genie iPads</h2>
              <p className="text-sm text-gray-500 mt-1">Pair the iPads that run your booths. Each event can use up to 2 at a time; manage that on the event&apos;s Genie page.</p>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4"/>Pair an iPad</CardTitle></CardHeader>
              <CardContent>
                {data.pairingCode ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-3">Enter this code in Genie on the iPad:</p>
                    <p className="font-mono text-5xl sm:text-6xl font-bold tracking-[0.3em] text-[#1F1F3D] pl-[0.3em]">{data.pairingCode.code}</p>
                    <p className="text-sm text-gray-500 mt-3">Expires in <Countdown expiresAt={data.pairingCode.expiresAt} onExpire={expire}/> · works once</p>
                    <Button variant="ghost" size="sm" className="mt-3" onClick={createCode} disabled={creating}>New code</Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <p className="text-sm text-gray-500 flex-1">Create a code, then enter it in Genie on the iPad. Codes last 10 minutes.</p>
                    <Button onClick={createCode} disabled={creating}>{creating ? 'Creating…' : 'Create Pairing Code'}</Button>
                  </div>
                )}
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Tablet className="w-4 h-4"/>Paired iPads</CardTitle>
                  <span className="text-sm text-gray-500">{data.devices.length}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.devices.length === 0 ? (
                  <p className="text-sm text-gray-500 px-6 pb-6">No iPads yet. Create a pairing code above.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead><tr className="border-b">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">iPad</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">App</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Last seen</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                        <th className="px-6 py-3"></th>
                      </tr></thead>
                      <tbody>
                        {data.devices.map(d => (
                          <tr key={d.id} className="border-b last:border-0 align-top">
                            <td className="px-6 py-3 text-sm">
                              <p className="font-medium flex items-center gap-2">{d.name}{d.lowStorage && <Badge variant="warning">Low storage</Badge>}</p>
                              <p className="text-xs text-gray-500">{d.model ?? 'iPad'}</p>
                              {d.storageFreeBytes !== null && (
                                <p className={'text-xs flex items-center gap-1 mt-0.5 ' + (d.lowStorage ? 'text-amber-600' : 'text-gray-400')}>
                                  <HardDrive className="w-3 h-3"/>{fmtGB(d.storageFreeBytes)} free{d.storageTotalBytes ? ' of ' + fmtGB(d.storageTotalBytes) : ''}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-600">{d.appVersion ? 'v' + d.appVersion : '—'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">{ago(d.lastSeenAt)}</td>
                            <td className="px-6 py-3 text-sm">
                              {d.currentEvent ? (
                                <Link href={`/events/${d.currentEvent.id}/genie`} className="text-brand hover:underline">{d.currentEvent.title}</Link>
                              ) : <span className="text-gray-400">—</span>}
                              {d.eventCount > 1 && <p className="text-xs text-gray-400">+{d.eventCount - 1} more</p>}
                            </td>
                            <td className="px-6 py-3 text-right whitespace-nowrap">
                              <Button variant="ghost" size="sm" onClick={() => { setRenaming(d); setNewName(d.name); setModalError(''); }}><Pencil className="w-3.5 h-3.5 mr-1"/>Rename</Button>
                              <Button variant="ghost" size="sm" className="text-[#E2445C] hover:text-[#CC3A52] hover:bg-red-50" onClick={() => { setRemoving(d); setModalError(''); }}><Trash2 className="w-3.5 h-3.5 mr-1"/>Remove</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4"/>Attendant PIN</CardTitle>
                  <Badge variant={data.pinSet ? 'success' : 'default'}>{data.pinSet ? 'Set' : 'Not set'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-gray-500 flex-1">Locks the iPad&apos;s operator screens so guests can&apos;t leave the booth. All your iPads use the same PIN.</p>
                <Button variant="outline" onClick={() => { setPin(''); setModalError(''); setPinOpen(true); }}><Lock className="w-3.5 h-3.5 mr-1.5"/>{data.pinSet ? 'Change PIN' : 'Set PIN'}</Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename iPad">
        <form onSubmit={e => { e.preventDefault(); if (renaming) submit(`/api/genie-devices/${renaming.id}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) }, () => setRenaming(null)); }} className="space-y-4">
          <Input value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} autoFocus placeholder="Booth 1 iPad"/>
          {modalError && <p className="text-sm text-red-600">{modalError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" disabled={busy || !newName.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove iPad">
        <p className="text-sm text-gray-600 mb-2">Remove <span className="font-medium text-gray-800">{removing?.name}</span>? It stops syncing right away and frees its spot on any events.</p>
        <p className="text-sm text-gray-600 mb-5">Photos it already uploaded stay in your galleries. Photos still waiting on the iPad won&apos;t upload. To use it again, pair it with a new code.</p>
        {modalError && <p className="text-sm text-red-600 mb-3">{modalError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={() => removing && submit(`/api/genie-devices/${removing.id}`, { method: 'DELETE' }, () => setRemoving(null))}>{busy ? 'Removing…' : 'Remove iPad'}</Button>
        </div>
      </Modal>

      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title={data?.pinSet ? 'Change Attendant PIN' : 'Set Attendant PIN'}>
        <form onSubmit={e => { e.preventDefault(); submit('/api/genie-devices/pin', { method: 'PUT', body: JSON.stringify({ pin }) }, () => setPinOpen(false)); }} className="space-y-4">
          <Input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="off" autoFocus placeholder="4–8 digits" className="font-mono tracking-widest"/>
          <p className="text-xs text-gray-400">iPads get the new PIN the next time they sync.</p>
          {modalError && <p className="text-sm text-red-600">{modalError}</p>}
          <div className="flex justify-end gap-2">
            {data?.pinSet && <Button type="button" variant="ghost" className="mr-auto text-[#E2445C] hover:bg-red-50" disabled={busy} onClick={() => submit('/api/genie-devices/pin', { method: 'PUT', body: JSON.stringify({ pin: null }) }, () => setPinOpen(false))}>Remove PIN</Button>}
            <Button type="button" variant="outline" onClick={() => setPinOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || pin.length < 4}>{busy ? 'Saving…' : 'Save PIN'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
