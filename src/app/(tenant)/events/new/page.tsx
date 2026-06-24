'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Users } from 'lucide-react';

export default function NewEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloadClientId = searchParams.get('clientId') ?? '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Client mode: 'new' = fill in manually, 'existing' = select from list
  const [clientMode, setClientMode] = useState<'new' | 'existing'>(preloadClientId ? 'existing' : 'new');
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(preloadClientId);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '',
    title: '', eventDate: '', startTime: '', endTime: '',
    venueName: '', venueAddress: '', venueCity: '', venueState: '', venuePostalCode: '',
    packageName: '', guestCount: '', internalNotes: '', status: 'LEAD', estimatedValueCents: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Load clients list for existing-client mode
  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {});
  }, []);

  // When preload clientId is set, find and lock that client
  useEffect(() => {
    if (preloadClientId && clients.length > 0) {
      const c = clients.find((c: any) => c.id === preloadClientId);
      if (c) setSelectedClient(c);
    }
  }, [preloadClientId, clients]);

  // Keep selectedClient in sync with selectedClientId
  useEffect(() => {
    if (selectedClientId) {
      const c = clients.find((c: any) => c.id === selectedClientId);
      setSelectedClient(c ?? null);
    } else {
      setSelectedClient(null);
    }
  }, [selectedClientId, clients]);

  const filteredClients = clientSearch
    ? clients.filter((c: any) => {
        const name = (c.firstName + ' ' + c.lastName).toLowerCase();
        const email = c.email.toLowerCase();
        const q = clientSearch.toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : clients;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = clientMode === 'existing'
        ? { clientId: selectedClientId, ...form }
        : form;
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

          {/* Client Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Client</CardTitle>
                {!preloadClientId && (
                  <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => { setClientMode('new'); setSelectedClientId(''); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${clientMode === 'new' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />New Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientMode('existing')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${clientMode === 'existing' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Users className="w-3.5 h-3.5" />Existing Client
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {clientMode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {F('firstName', 'First Name', 'text', 'Jane', true)}
                  {F('lastName', 'Last Name', 'text', 'Smith', true)}
                  {F('email', 'Email', 'email', 'jane@example.com', true)}
                  {F('phone', 'Phone', 'tel', '(555) 123-4567')}
                  {F('company', 'Company / Organization', 'text', 'Acme Corp')}
                </div>
              ) : (
                <div className="space-y-3">
                  {preloadClientId && selectedClient ? (
                    // Locked to pre-selected client from client detail page
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        {selectedClient.firstName[0]}{selectedClient.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{selectedClient.firstName} {selectedClient.lastName}</p>
                        <p className="text-xs text-gray-500">{selectedClient.email}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search by name or email…"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                      />
                      {selectedClient && (
                        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                            {selectedClient.firstName[0]}{selectedClient.lastName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{selectedClient.firstName} {selectedClient.lastName}</p>
                            <p className="text-xs text-gray-500">{selectedClient.email}</p>
                          </div>
                          <button type="button" onClick={() => { setSelectedClientId(''); setClientSearch(''); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      )}
                      {!selectedClient && filteredClients.length > 0 && (
                        <ul className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                          {filteredClients.slice(0, 20).map((c: any) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => { setSelectedClientId(c.id); setClientSearch(''); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 text-left border-b last:border-0"
                              >
                                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                                  {c.firstName[0]}{c.lastName[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                                  <p className="text-xs text-gray-400 truncate">{c.email}</p>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!selectedClient && clientSearch.length > 0 && filteredClients.length === 0 && (
                        <p className="text-sm text-gray-400 py-2">No clients found. Try a different name or <button type="button" className="text-orange-500 hover:underline" onClick={() => setClientMode('new')}>add a new client</button>.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">{F('title', 'Event Name', 'text', 'Smith Wedding', true)}</div>
              {F('eventDate', 'Event Date', 'date', '', true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="LEAD">Lead</option>
                  <option value="QUOTED">Quoted</option>
                  <option value="BOOKED">Booked</option>
                </Select>
              </div>
              {F('startTime', 'Start Time', 'time')}
              {F('endTime', 'End Time', 'time')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">{F('venueName', 'Venue Name', 'text', 'The Grand Ballroom')}</div>
              <div className="sm:col-span-2">{F('venueAddress', 'Street Address', 'text', '123 Main St')}</div>
              {F('venueCity', 'City', 'text', 'Austin')}
              {F('venueState', 'State', 'text', 'TX')}
              {F('venuePostalCode', 'Zip Code', 'text', '78701')}
              <div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {F('packageName', 'Package', 'text', 'Deluxe 4-Hour Package')}
              {F('guestCount', 'Guest Count', 'number', '150')}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value ($)</label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.estimatedValueCents} onChange={e => set('estimatedValueCents', e.target.value)} />
              </div>
              <div />
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes visible only to your team…" />
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button
              type="submit"
              disabled={loading || (clientMode === 'existing' && !selectedClientId)}
            >
              {loading ? 'Creating…' : 'Create Event'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
