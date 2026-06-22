'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Trash2, Calendar, ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', company:'', addressLine1:'', city:'', state:'', postalCode:'', notes:'' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/clients/' + id).then(r => r.json()).then(d => {
      setClient(d.client); setEvents(d.events ?? []);
      setForm({ firstName: d.client.firstName ?? '', lastName: d.client.lastName ?? '', email: d.client.email ?? '', phone: d.client.phone ?? '', company: d.client.company ?? '', addressLine1: d.client.addressLine1 ?? '', city: d.client.city ?? '', state: d.client.state ?? '', postalCode: d.client.postalCode ?? '', notes: d.client.notes ?? '' });
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true);
    await fetch('/api/clients/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function deleteClient() {
    setDeleting(true);
    await fetch('/api/clients/' + id, { method: 'DELETE' });
    router.push('/clients');
  }

  if (loading) return <><TopBar title="Client"/><div className="p-8 text-gray-400">Loading...</div></>;
  if (!client) return <><TopBar title="Client"/><div className="p-8 text-gray-400">Client not found.</div></>;

  const F = (k: string, label: string, type = 'text', placeholder = '') => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/></div>
  );

  return (
    <>
      <TopBar title={client.firstName + ' ' + client.lastName} />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Clients</Link>

        <Card>
          <CardHeader><div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><CardTitle>Client Details</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1"/>{saving ? 'Saving...' : 'Save'}</Button>
              {!confirmDelete
                ? <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4 mr-1"/>Delete</Button>
                : <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-red-600 font-medium">Are you sure?</span><Button variant="destructive" size="sm" onClick={deleteClient} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, Delete'}</Button><Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button></div>
              }
            </div>
          </div></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {F('firstName','First Name','text','Jane')}
            {F('lastName','Last Name','text','Smith')}
            {F('email','Email','email','jane@example.com')}
            {F('phone','Phone','tel','(555) 123-4567')}
            {F('company','Company / Organization')}
            <div className="sm:col-span-2">{F('addressLine1','Address')}</div>
            {F('city','City')}
            {F('state','State')}
            {F('postalCode','Zip Code')}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this client..." className="resize-none h-24"/>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4"/>Events ({events.length})</CardTitle>
              <Link href={'/events/new?clientId=' + id}><Button size="sm"><Plus className="w-4 h-4 mr-1"/>New Event</Button></Link>
            </div>
          </CardHeader>
          {events.length > 0 && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {events.map((ev: any) => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-sm">{ev.title}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{format(new Date(ev.eventDate),'MMM d, yyyy')}</td>
                      <td className="px-6 py-3"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                      <td className="px-6 py-3 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          )}
          {events.length === 0 && (
            <CardContent>
              <p className="text-sm text-gray-400 py-2">No events yet. Click "New Event" to add one.</p>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
