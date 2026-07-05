'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Search, X } from 'lucide-react';
import Link from 'next/link';

const STATUSES = ['LEAD','QUOTED','BOOKED','IN_PROGRESS','COMPLETED','ARCHIVED','CANCELLED'];

type ClientResult = { id: string; name: string; email: string };

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title:'', status:'LEAD', eventDate:'', startTime:'', endTime:'',
    venueName:'', venueAddress:'', venueCity:'', venueState:'', venuePostalCode:'',
    packageName:'', guestCount:'', internalNotes:'', estimatedValueCents:'',
    firstName:'', lastName:'', email:'', phone:'',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Client reassignment state
  const [reassigning, setReassigning] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/events/' + id + '/full').then(r => r.json()).then(d => {
      if (d.error) return;
      const ev = d.event; const cl = d.client;
      const toTime = (dt: string | null) => dt ? new Date(dt).toTimeString().slice(0,5) : '';
      const toDate = (dt: string) => new Date(dt).toISOString().slice(0,10);
      setForm({
        title: ev.title ?? '', status: ev.status ?? 'LEAD',
        eventDate: toDate(ev.eventDate), startTime: toTime(ev.startTime), endTime: toTime(ev.endTime),
        venueName: ev.venueName ?? '', venueAddress: ev.venueAddress ?? '',
        venueCity: ev.venueCity ?? '', venueState: ev.venueState ?? '',
        venuePostalCode: ev.venuePostalCode ?? '',
        packageName: ev.packageName ?? '', guestCount: ev.guestCount?.toString() ?? '',
        internalNotes: ev.internalNotes ?? '',
        estimatedValueCents: ev.estimatedValueCents != null ? (ev.estimatedValueCents / 100).toFixed(2) : '',
        firstName: cl.firstName ?? '', lastName: cl.lastName ?? '',
        email: cl.email ?? '', phone: cl.phone ?? '',
      });
      setLoading(false);
    });
  }, [id]);

  function handleClientSearch(q: string) {
    setClientSearch(q);
    setSelectedClient(null);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (q.length < 2) { setClientResults([]); return; }
    searchRef.current = setTimeout(async () => {
      const data: any[] = await fetch('/api/search?q=' + encodeURIComponent(q)).then(r => r.json());
      setClientResults(
        data
          .filter(r => r.type === 'client')
          .map(r => ({ id: r.id, name: r.title, email: r.subtitle }))
      );
    }, 250);
  }

  function pickClient(c: ClientResult) {
    setSelectedClient(c);
    setClientSearch('');
    setClientResults([]);
  }

  function cancelReassign() {
    setReassigning(false);
    setSelectedClient(null);
    setClientSearch('');
    setClientResults([]);
  }

  async function save() {
    setSaving(true); setError('');
    const body: Record<string, unknown> = { ...form };
    if (selectedClient) body.clientId = selectedClient.id;
    const res = await fetch('/api/events/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) router.push('/events/' + id);
    else { setError(data.error ?? 'Save failed'); setSaving(false); }
  }

  const F = (k: string, label: string, type = 'text', placeholder = '') => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/></div>
  );

  if (loading) return <><TopBar title="Edit Event"/><div className="p-8 text-gray-400">Loading...</div></>;

  return (
    <>
      <TopBar title="Edit Event" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <Link href={'/events/' + id} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Event</Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Client</span>
              {!reassigning && (
                <button type="button" onClick={() => setReassigning(true)} className="text-xs font-normal text-brand hover:underline">
                  Reassign to existing client
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reassigning ? (
              <div className="space-y-3">
                {selectedClient ? (
                  <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
                    <div>
                      <p className="font-medium text-sm">{selectedClient.name}</p>
                      <p className="text-xs text-gray-500">{selectedClient.email}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      autoFocus
                      placeholder="Search by name or email…"
                      value={clientSearch}
                      onChange={e => handleClientSearch(e.target.value)}
                      className="pl-9"
                    />
                    {clientResults.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg divide-y text-sm">
                        {clientResults.map(c => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => pickClient(c)}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50"
                            >
                              <span className="font-medium">{c.name}</span>
                              <span className="text-gray-400 ml-2">{c.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {clientSearch.length >= 2 && clientResults.length === 0 && (
                      <p className="mt-2 text-xs text-gray-400">No matching clients found.</p>
                    )}
                  </div>
                )}
                <button type="button" onClick={cancelReassign} className="text-xs text-gray-400 hover:text-gray-600">
                  Cancel reassignment
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {F('firstName','First Name')} {F('lastName','Last Name')}
                {F('email','Email','email')} {F('phone','Phone','tel')}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">{F('title','Event Name')}</div>
            {F('eventDate','Event Date','date')}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onChange={e => set('status',e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
              </Select>
            </div>
            {F('startTime','Start Time','time')} {F('endTime','End Time','time')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">{F('venueName','Venue Name')}</div>
            <div className="sm:col-span-2">{F('venueAddress','Street Address')}</div>
            {F('venueCity','City')} {F('venueState','State')}
            {F('venuePostalCode','Zip Code')} <div/>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Package</label>
              <Input type="text" value={form.packageName} onChange={e => set('packageName', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Label only — for your reference. Not linked to Settings → Packages or invoices.</p>
            </div>
            {F('guestCount','Guest Count','number')}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value ($)</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.estimatedValueCents} onChange={e => set('estimatedValueCents', e.target.value)} />
            </div>
            <div/>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <Textarea value={form.internalNotes} onChange={e => set('internalNotes',e.target.value)} className="resize-none h-24"/>
            </div>
          </CardContent>
        </Card>
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.push('/events/' + id)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </>
  );
}
