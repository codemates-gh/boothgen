'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderComposite, testSamples } from '@/components/genie/layoutImage';
import type { Layout } from '@/components/genie/parts';

type BundleTemplate = { id: string; name: string; layout: Layout };
type Usage = { limits: { sms: number; email: number }; used: { sms: number; email: number } };

// Test Templates (like Snappic's): the event's templates drawn with sample photos, texted or emailed to the operator
// through the event's real message, so the design and sharing can be checked before the event day (when iPads can
// only test). Limited per event; nothing goes into the gallery or usage.
export default function TestTemplates({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<BundleTemplate[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(''); setDone(''); setTemplates(null); setPreviews({});
    fetch(`/api/events/${eventId}/genie/test-share`).then(r => r.ok ? r.json() : null).then(setUsage);
    (async () => {
      // The templates exactly as iPads get them (template text drawn into the overlay)
      const r = await fetch(`/api/events/${eventId}/genie/bundle`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not load the templates'); setTemplates([]); return; }
      const list: BundleTemplate[] = d.templates ?? [];
      setTemplates(list);
      setPicked(list.map(t => t.id));
      const samples = await testSamples();
      for (const t of list) {
        const url = await renderComposite(t.layout, samples, 480).catch(() => '');
        setPreviews(p => ({ ...p, [t.id]: url }));
      }
    })();
  }, [open, eventId]);

  const left = (c: 'sms' | 'email') => usage ? usage.limits[c] - usage.used[c] : 0;
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  async function share() {
    setBusy(true); setError(''); setDone('');
    const samples = await testSamples();
    let sent = 0;
    try {
      for (const t of (templates ?? []).filter(t => picked.includes(t.id))) {
        const image = await renderComposite(t.layout, samples);
        for (const [channel, destination] of [['sms', phone], ['email', email]] as const) {
          if (!destination.trim()) continue;
          const r = await fetch(`/api/events/${eventId}/genie/test-share`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, destination, templateName: t.name, image }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { setError(d.error || 'Could not send the test'); return; }
          if (d.used && usage) setUsage({ ...usage, used: d.used });
          sent++;
        }
      }
      setDone(`Sent ${sent} test ${sent === 1 ? 'message' : 'messages'}.`);
    } catch {
      setError("Couldn't draw a template. Check that its artwork loads in the designer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Test Templates">
      <p className="text-sm text-gray-600 mb-4">Sends the templates you pick, drawn with a sample booth photo, with this event&apos;s text or email message. Use it to check the design and sharing before the event day; nothing is added to the gallery.</p>
      {!templates ? <p className="text-sm text-gray-400">Loading templates…</p> : templates.length === 0 && !error ? <p className="text-sm text-gray-500">This event has no templates yet.</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {templates.map(t => (
            <label key={t.id} className={'border rounded-lg p-2 cursor-pointer ' + (picked.includes(t.id) ? 'border-brand ring-1 ring-brand' : 'border-gray-200')}>
              <div className="h-28 flex items-center justify-center bg-gray-50 rounded mb-1.5">
                {previews[t.id] ? <img src={previews[t.id]} alt="" className="max-h-28 max-w-full object-contain"/> : <span className="text-xs text-gray-400">Drawing…</span>}
              </div>
              <span className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)}/>{t.name}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your phone</label>
          <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567"/>
          {usage && <p className="text-xs text-gray-400 mt-1">{left('sms')} of {usage.limits.sms} test texts left</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
          {usage && <p className="text-xs text-gray-400 mt-1">{left('email')} of {usage.limits.email} test emails left</p>}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">Each template is one message. Send tests only to yourself.</p>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {done && <p className="text-sm text-green-700 mt-3">{done}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={share} disabled={busy || !templates?.length || picked.length === 0 || (!phone.trim() && !email.trim())}>{busy ? 'Sending…' : 'Send Test'}</Button>
      </div>
    </Modal>
  );
}
