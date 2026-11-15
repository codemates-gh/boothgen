'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

type Losing = { id: string; name: string; status: string; plan: string | null };

// Super Admin → Operators: "Genius needs Pro" (src/lib/genius.ts). Off until turned on here.
export default function GeniusRuleCard() {
  const router = useRouter();
  const [data, setData] = useState<{ on: boolean; losing: Losing[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/super-admin/genius-rule');
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function set(on: boolean) {
    setBusy(true); setNotice('');
    const r = await fetch('/api/super-admin/genius-rule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false); setConfirming(false);
    if (r.ok) setNotice(on ? `On. ${d.switched} account${d.switched === 1 ? '' : 's'} moved to Genie only.` : 'Off. No more accounts will be moved; accounts already moved stay on Genie until they subscribe or you switch them back.');
    load(); router.refresh();
  }

  if (!data) return null;
  return (
    <Card>
      <CardContent className="py-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-2">Genius needs Pro <Badge variant={data.on ? 'success' : 'default'}>{data.on ? 'On' : 'Off'}</Badge></p>
            <p className="text-sm text-gray-500 max-w-2xl">When on, a Genius account without Genius Pro, a lifetime or founding plan, a running trial or &quot;Keep Genius free&quot; moves to Genie only right away, and is checked daily. Its CRM pauses (automations, client portal, quote, contract and invoice actions, lead capture); nothing is deleted, and subscribing to Pro brings it back. The owner gets an email.</p>
          </div>
          {data.on
            ? <Button variant="outline" onClick={() => set(false)} disabled={busy}>Turn off</Button>
            : <Button onClick={() => setConfirming(true)} disabled={busy}>Turn on</Button>}
        </div>
        <p className="text-sm text-gray-700">
          {data.losing.length === 0 ? 'No Genius accounts would move right now.' : `${data.losing.length} Genius account${data.losing.length === 1 ? '' : 's'} ${data.on ? 'will move at the next daily check' : 'would move when you turn it on'}: `}
          {data.losing.slice(0, 12).map(l => l.name).join(', ')}{data.losing.length > 12 ? `, and ${data.losing.length - 12} more` : ''}
        </p>
        {notice && <p className="text-sm text-green-700">{notice}</p>}
      </CardContent>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Turn On Genius Needs Pro">
        <p className="text-sm text-gray-600 mb-2">{data.losing.length} account{data.losing.length === 1 ? '' : 's'} move to Genie only now, with no notice period. Their clients can no longer pay invoices or sign contracts through BoothGen, and scheduled automation emails won&apos;t go out.</p>
        <p className="text-sm text-gray-600 mb-5">Check &quot;Keep Genius free&quot; in the table below first for your own company and anyone else who should keep Genius.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => set(true)} disabled={busy}>{busy ? 'Moving accounts…' : `Turn on and move ${data.losing.length}`}</Button>
        </div>
      </Modal>
    </Card>
  );
}
