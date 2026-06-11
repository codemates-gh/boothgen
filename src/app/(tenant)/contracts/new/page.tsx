
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function NewContractPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const [title, setTitle] = useState('Event Services Agreement');
  const [selectedEvent, setSelectedEvent] = useState(eventId ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/events').then(r => r.json()).then(setEvents);
    fetch('/api/contracts/templates').then(r => r.json()).then(setTemplates);
  }, []);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, eventId: selectedEvent || null, templateId: selectedTemplate || null }) });
      const data = await res.json();
      if (res.ok) router.push('/contracts/' + data.id);
      else alert(data.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Contract" />
      <div className="p-4 sm:p-8 max-w-lg">
        <Card>
          <CardHeader><CardTitle>Create Contract</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Contract Title</label><Input value={title} onChange={e => setTitle(e.target.value)}/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Link to Event</label>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event (optional) —</option>
                {events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </Select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <Select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">— Select Template —</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Contract'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
