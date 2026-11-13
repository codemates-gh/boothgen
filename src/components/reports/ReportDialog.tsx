'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Bug, Lightbulb, CheckCircle2, Users, ThumbsUp } from 'lucide-react';
import { AttachmentPicker, useAttachments } from './AttachmentPicker';
import { reporterStatusLabel, REPORT_AREAS, REPORT_SEVERITIES } from '@/lib/reports/options';

type Similar = { id: string; number: number; type: string; title: string; status: string; voteCount: number; isMine: boolean; hasVoted: boolean; canVote: boolean };
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const EMPTY = { type: 'bug' as 'bug' | 'suggestion', title: '', area: '', severity: '', deviceInfo: '', details: '' };

// "Report a bug / Suggest" form. The user, account, page, browser and BoothGen version are added by the server.
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const files = useAttachments();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [joined, setJoined] = useState<Similar | null>(null);

  // Existing reports that match the title being typed, to avoid duplicates
  useEffect(() => {
    const q = form.title.trim();
    if (!open || q.length < 4) { setSimilar([]); return; }
    const t = setTimeout(() => {
      fetch('/api/reports/similar?q=' + encodeURIComponent(q)).then(r => r.json()).then(d => setSimilar(d.reports ?? [])).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [form.title, open]);

  async function joinReport(r: Similar) {
    setError('');
    const res = await fetch(`/api/reports/${r.id}/vote`, { method: 'POST' });
    if (!res.ok) { setError('Could not add you to that report'); return; }
    setJoined(r);
    window.dispatchEvent(new Event('reports:changed'));
  }
  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }));

  function close() {
    onClose();
    if (sent || joined) { setForm(EMPTY); files.reset(); setSent(null); setJoined(null); setSimilar([]); }
    setError('');
  }

  async function submit() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.type, title: form.title, area: form.area, details: form.details,
        severity: form.type === 'bug' && form.severity ? form.severity : null,
        deviceInfo: form.deviceInfo || null,
        pageUrl: window.location.href,
        attachments: files.ready,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Could not send the report'); return; }
    setSent(d);
    window.dispatchEvent(new Event('reports:changed'));
  }

  const uploading = files.uploading;
  const ready = form.title.trim().length >= 3 && form.area && form.details.trim().length >= 5 && !uploading;

  return (
    <Modal open={open} onClose={close} title={sent || joined ? 'Thanks!' : 'Report a bug / Suggest'} className="max-w-xl">
      {joined ? (
        <div className="text-center space-y-3 py-2">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
          <p className="text-sm text-gray-700">{joined.type === 'suggestion' ? 'Your vote was added to' : 'You were added to'} #{joined.number}. You&apos;ll get an email when there&apos;s an update.</p>
          <div className="flex justify-center gap-2 pt-2">
            <Link href={`/reports/${joined.id}`} onClick={close}><Button variant="outline">View report</Button></Link>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : sent ? (
        <div className="text-center space-y-3 py-2">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
          <p className="text-sm text-gray-700">Report #{sent.number} was sent. You&apos;ll get an email when there&apos;s an update.</p>
          <div className="flex justify-center gap-2 pt-2">
            <Link href={`/reports/${sent.id}`} onClick={close}><Button variant="outline">View report</Button></Link>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([['bug', 'Bug', Bug], ['suggestion', 'Suggestion', Lightbulb]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => set('type', v)}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors ${
                  form.type === v ? 'border-[#0085FF] bg-blue-50 text-[#0085FF]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
          <Field label="Title">
            <Input value={form.title} maxLength={140} onChange={e => set('title', e.target.value)} placeholder={form.type === 'bug' ? 'Print button does nothing after the 3rd photo' : 'Let guests pick a filter before the countdown'} />
          </Field>
          {similar.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium text-amber-800">Already reported? Vote or join it instead of sending a new one:</p>
              <ul className="space-y-1.5">
                {similar.map(r => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <Link href={`/reports/${r.id}`} target="_blank" className="flex-1 min-w-0 truncate text-gray-800 hover:text-[#0085FF]">#{r.number} {r.title}</Link>
                    <span className="text-[11px] text-gray-500 shrink-0">{reporterStatusLabel(r.status)} · {r.voteCount} {r.type === 'suggestion' ? (r.voteCount === 1 ? 'vote' : 'votes') : 'affected'}</span>
                    {r.isMine ? <span className="text-[11px] text-gray-400 shrink-0">yours</span>
                      : r.hasVoted ? <span className="text-[11px] text-[#0085FF] shrink-0">{r.type === 'suggestion' ? 'voted' : 'joined'}</span>
                      : !r.canVote ? <span className="text-[11px] text-gray-400 shrink-0">closed</span>
                      : <Button size="sm" variant="outline" className="shrink-0" onClick={() => joinReport(r)}>
                          {r.type === 'suggestion' ? <><ThumbsUp className="w-3 h-3 mr-1" />Vote</> : <><Users className="w-3 h-3 mr-1" />This is my issue too</>}
                        </Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={`grid gap-3 ${form.type === 'bug' ? 'sm:grid-cols-2' : ''}`}>
            <Field label="Part of the system">
              <Select value={form.area} onChange={e => set('area', e.target.value)}>
                <option value="">Choose…</option>
                {REPORT_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </Select>
            </Field>
            {form.type === 'bug' && (
              <Field label="How bad is it?">
                <Select value={form.severity} onChange={e => set('severity', e.target.value)}>
                  <option value="">Choose…</option>
                  {REPORT_SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Device and app version" hint="Optional. For example: iPad Air (5th gen), iOS 18.1, Genie 1.0 (42)">
            <Input value={form.deviceInfo} maxLength={200} onChange={e => set('deviceInfo', e.target.value)} />
          </Field>
          <Field label="Details" hint={form.type === 'bug' ? 'What you did, what happened, and what you expected.' : 'What you would like and why it helps.'}>
            <Textarea rows={5} value={form.details} maxLength={10000} onChange={e => set('details', e.target.value)} onPaste={files.onPaste} />
          </Field>
          <AttachmentPicker state={files} />
          <p className="text-xs text-gray-500">Everyone using BoothGen can see reports. Don&apos;t include guest phone numbers, emails or private photos.</p>
          <p className="text-xs text-gray-400">Others see your name. Your email, account and the page you&apos;re on go only to the Booth Genius team so we can follow up.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={!ready || saving}>{saving ? 'Sending…' : uploading ? 'Uploading…' : 'Send'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
