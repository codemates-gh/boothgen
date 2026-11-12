'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Bug, Lightbulb, Paperclip, X, CheckCircle2 } from 'lucide-react';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, REPORT_AREAS, REPORT_SEVERITIES, type ReportAttachment } from '@/lib/reports/options';

type Upload = { file: File; status: 'uploading' | 'done' | 'error'; att?: ReportAttachment; error?: string };

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
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }));

  function close() {
    onClose();
    if (sent) { setForm(EMPTY); setUploads([]); setSent(null); }
    setError('');
  }

  async function upload(file: File) {
    const res = await fetch('/api/reports/upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, bytes: file.size }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Upload failed');
    const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Upload failed');
    return { key: d.key, name: file.name, contentType: file.type, bytes: file.size } as ReportAttachment;
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError('');
    const room = ATTACHMENT_MAX_FILES - uploads.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) setError(`Attach up to ${ATTACHMENT_MAX_FILES} files`);
    for (const file of files) {
      if (!(file.type in ATTACHMENT_TYPES)) { setError(`"${file.name}": attach images, videos (MP4/MOV) or PDFs`); continue; }
      if (file.size > ATTACHMENT_MAX_BYTES) { setError(`"${file.name}" is larger than 100 MB`); continue; }
      setUploads(u => [...u, { file, status: 'uploading' }]);
      upload(file)
        .then(att => setUploads(u => u.map(x => x.file === file ? { ...x, status: 'done', att } : x)))
        .catch(e => setUploads(u => u.map(x => x.file === file ? { ...x, status: 'error', error: e.message } : x)));
    }
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
        attachments: uploads.filter(u => u.status === 'done').map(u => u.att),
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Could not send the report'); return; }
    setSent(d);
    window.dispatchEvent(new Event('reports:changed'));
  }

  const uploading = uploads.some(u => u.status === 'uploading');
  const ready = form.title.trim().length >= 3 && form.area && form.details.trim().length >= 5 && !uploading;

  return (
    <Modal open={open} onClose={close} title={sent ? 'Thanks!' : 'Report a bug / Suggest'} className="max-w-xl">
      {sent ? (
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
            <Textarea rows={5} value={form.details} maxLength={10000} onChange={e => set('details', e.target.value)} />
          </Field>
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0085FF] cursor-pointer hover:underline">
              <Paperclip className="w-4 h-4" />Attach screenshots, photos, videos or PDFs
              <input type="file" multiple className="hidden" accept={Object.keys(ATTACHMENT_TYPES).join(',')} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {uploads.length > 0 && (
              <ul className="mt-2 space-y-1">
                {uploads.map((u, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="truncate flex-1">{u.file.name}</span>
                    <span className={u.status === 'error' ? 'text-red-500' : u.status === 'done' ? 'text-green-600' : 'text-gray-400'}>
                      {u.status === 'uploading' ? 'Uploading…' : u.status === 'done' ? 'Ready' : u.error}
                    </span>
                    <button type="button" onClick={() => setUploads(list => list.filter(x => x !== u))} className="text-gray-300 hover:text-gray-500" aria-label="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-gray-400">Your name, email, account and the page you&apos;re on are included so we can follow up.</p>
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
