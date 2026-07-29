'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

export default function AddLeadButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    eventDate: '', eventType: '', message: '',
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const lead = await res.json();
      setOpen(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', eventDate: '', eventType: '', message: '' });
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to create lead');
    }
    setSaving(false);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4 mr-1.5" /> Add Lead
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Add Lead Manually</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">First Name *</label>
                  <Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Last Name *</label>
                  <Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" required />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Event Date</label>
                  <Input type="date" value={form.eventDate} onChange={e => set('eventDate', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Event Type</label>
                  <Input value={form.eventType} onChange={e => set('eventType', e.target.value)} placeholder="Wedding, Corporate…" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Message / Notes</label>
                <textarea
                  value={form.message}
                  onChange={e => set('message', e.target.value)}
                  placeholder="Any details about the inquiry…"
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Lead'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
