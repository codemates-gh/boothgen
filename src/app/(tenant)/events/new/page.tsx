'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName:'', lastName:'', email:'', phone:'',
    title:'', eventDate:'', startTime:'', endTime:'',
    venueName:'', venueAddress:'', venueCity:'', venueState:'', venuePostalCode:'',
    packageName:'', guestCount:'', internalNotes:'', status:'LEAD',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) router.push('/events/' + data.id);
      else { setError(data.error ?? 'Failed to create event'); setLoading(false); }
    } catch { setError('Network error'); setLoading(false); }
  }

  const F = (k: string, label: string, type = 'text', placeholder = '', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );

  return (
    <>
      <TopBar title="New Event" />
      <div className="p-4 sm:p-8 max-w-3xl">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Client Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {F('firstName','First Name','text','Jane',true)}
              {F('lastName','Last Name','text','Smith',true)}
              {F('email','Email','email','jane@example.com',true)}
              {F('phone','Phone','tel','(555) 123-4567')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">{F('title','Event Name','text','Smith Wedding',true)}</div>
              {F('eventDate','Event Date','date','',true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="LEAD">Lead</option><option value="QUOTED">Quoted</option><option value="BOOKED">Booked</option>
                </Select>
              </div>
              {F('startTime','Start Time','time')}
              {F('endTime','End Time','time')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">{F('venueName','Venue Name','text','The Grand Ballroom')}</div>
              <div className="sm:col-span-2">{F('venueAddress','Street Address','text','123 Main St')}</div>
              {F('venueCity','City','text','Austin')}
              {F('venueState','State','text','TX')}
              {F('venuePostalCode','Zip Code','text','78701')}
              <div></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {F('packageName','Package','text','Deluxe 4-Hour Package')}
              {F('guestCount','Guest Count','number','150')}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes visible only to your team..." />
              </div>
            </CardContent>
          </Card>
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Event'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}
