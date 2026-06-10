'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const STATUSES = ['LEAD','QUOTED','BOOKED','IN_PROGRESS','COMPLETED','CANCELLED'];

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title:'', status:'LEAD', eventDate:'', startTime:'', endTime:'',
    venueName:'', venueAddress:'', venueCity:'', venueState:'', venuePostalCode:'',
    packageName:'', guestCount:'', internalNotes:'',
    firstName:'', lastName:'', email:'', phone:'',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
        firstName: cl.firstName ?? '', lastName: cl.lastName ?? '',
        email: cl.email ?? '', phone: cl.phone ?? '',
      });
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true); setError('');
    const res = await fetch('/api/events/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
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
      <div className="p-8 max-w-3xl space-y-6">
        <Link href={'/events/' + id} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Event</Link>
        <Card>
          <CardHeader><CardTitle>Client</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {F('firstName','First Name')} {F('lastName','Last Name')}
            {F('email','Email','email')} {F('phone','Phone','tel')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">{F('title','Event Name')}</div>
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
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">{F('venueName','Venue Name')}</div>
            <div className="col-span-2">{F('venueAddress','Street Address')}</div>
            {F('venueCity','City')} {F('venueState','State')}
            {F('venuePostalCode','Zip Code')} <div/>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {F('packageName','Package')} {F('guestCount','Guest Count','number')}
            <div className="col-span-2">
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
