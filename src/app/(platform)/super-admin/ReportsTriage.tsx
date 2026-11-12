'use client';
import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentList, ReportThread, type ThreadNote } from '@/components/reports/ReportThread';
import {
  REPORT_AREAS, REPORT_PRIORITIES, REPORT_STATUSES, REPORT_TYPES, areaLabel, severityLabel, statusBadge, statusLabel, typeLabel,
} from '@/lib/reports/options';

type Row = {
  id: string; number: number; type: string; title: string; area: string; severity: string | null; status: string; priority: string | null;
  unread: boolean; createdAt: string; updatedAt: string; user: { name: string; email: string }; tenant: { id: string; name: string } | null;
};
type Detail = {
  id: string; number: number; type: string; title: string; area: string; severity: string | null; deviceInfo: string | null; details: string;
  status: string; priority: string | null; fixedInVersion: string | null; createdAt: string;
  reporter: { id: string; name: string; email: string }; tenant: { id: string; name: string; slug: string } | null;
  pageUrl: string | null; userAgent: string | null; appVersion: string | null;
  attachments: { index: number; name: string; contentType: string; bytes: number; url: string }[]; notes: ThreadNote[];
};

const SEV_VARIANT: Record<string, any> = { blocker: 'danger', major: 'warning', minor: 'default', cosmetic: 'default' };

export default function ReportsTriage({ initialReportId }: { initialReportId?: string }) {
  const [filters, setFilters] = useState({ status: '', type: '', area: '', tenantId: '', q: '', unread: '' });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(initialReportId ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState(false);
  const [fixedIn, setFixedIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    fetch('/api/reports/admin?' + qs).then(r => r.json()).then(d => {
      setRows(d.reports ?? []); setCounts(d.counts ?? {}); setTenants(d.tenants ?? []);
    }).catch(() => setRows([]));
  }, [filters]);

  useEffect(() => { const t = setTimeout(loadList, filters.q ? 250 : 0); return () => clearTimeout(t); }, [loadList, filters.q]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setError('');
    fetch(`/api/reports/${selected}?admin=1`).then(r => r.json()).then(d => {
      setDetail(d.report ?? null);
      setFixedIn(d.report?.fixedInVersion ?? '');
      setRows(rs => rs?.map(r => r.id === selected ? { ...r, unread: false } : r) ?? rs);
    });
    const url = new URL(window.location.href);
    url.searchParams.set('report', selected);
    window.history.replaceState(null, '', url);
  }, [selected]);

  async function triage(change: Record<string, unknown>) {
    if (!detail) return;
    setBusy(true); setError('');
    const res = await fetch(`/api/reports/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not save'); return; }
    setDetail(d.report); setFixedIn(d.report.fixedInVersion ?? '');
    loadList();
  }

  async function addNote() {
    if (!detail) return;
    setBusy(true); setError('');
    const res = await fetch(`/api/reports/${detail.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: note, admin: true, internal }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not add the note'); return; }
    setDetail(d.report); setNote(''); setInternal(false);
    loadList();
  }

  const setF = (k: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [k]: v }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Counts per status (click to filter) */}
      <div className="flex flex-wrap gap-2">
        {[{ value: '', label: 'All' }, ...REPORT_STATUSES].map(s => (
          <button
            key={s.value}
            onClick={() => setF('status', s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filters.status === s.value ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {s.label} <span className="opacity-70">{s.value ? (counts[s.value] ?? 0) : total}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Search title, details, reporter, #" value={filters.q} onChange={e => setF('q', e.target.value)} />
        <Select className="w-40" value={filters.type} onChange={e => setF('type', e.target.value)}>
          <option value="">All types</option>
          {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select className="w-56" value={filters.area} onChange={e => setF('area', e.target.value)}>
          <option value="">All parts</option>
          {REPORT_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
        <Select className="w-52" value={filters.tenantId} onChange={e => setF('tenantId', e.target.value)}>
          <option value="">All accounts</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
          <input type="checkbox" checked={filters.unread === '1'} onChange={e => setF('unread', e.target.checked ? '1' : '')} />Unread only
        </label>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        <Card>
          <CardContent className="p-0">
            {rows === null ? <p className="px-4 py-6 text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No reports match.</p>
            ) : (
              <div className="divide-y max-h-[70vh] overflow-y-auto">
                {rows.map(r => (
                  <button key={r.id} onClick={() => setSelected(r.id)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex gap-3 ${selected === r.id ? 'bg-orange-50' : ''}`}>
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${r.unread ? 'bg-[#E2445C]' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${r.unread ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>#{r.number} {r.title}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{r.user.name}{r.tenant ? ` · ${r.tenant.name}` : ''} · {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge variant={statusBadge(r.status)}>{statusLabel(r.status)}</Badge>
                        <Badge variant={r.type === 'bug' ? 'default' : 'info'}>{typeLabel(r.type)}</Badge>
                        {r.severity && <Badge variant={SEV_VARIANT[r.severity]}>{severityLabel(r.severity)}</Badge>}
                        {r.priority && <Badge variant="brand">{r.priority}</Badge>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {detail ? (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <p className="text-lg font-semibold text-gray-900">#{detail.number} {detail.title}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {typeLabel(detail.type)} · {areaLabel(detail.area)}{detail.severity ? ` · ${severityLabel(detail.severity)}` : ''} · {format(new Date(detail.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <Select value={detail.status} disabled={busy} onChange={e => triage({ status: e.target.value })}>
                    {REPORT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <Select value={detail.priority ?? ''} disabled={busy} onChange={e => triage({ priority: e.target.value || null })}>
                    <option value="">—</option>
                    {REPORT_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fixed in version</label>
                  <Input value={fixedIn} disabled={busy} placeholder="2.72.0" maxLength={40}
                    onChange={e => setFixedIn(e.target.value)}
                    onBlur={() => { if (fixedIn.trim() !== (detail.fixedInVersion ?? '')) triage({ fixedInVersion: fixedIn.trim() || null }); }} />
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
                <p><span className="text-gray-400">Reporter:</span> {detail.reporter.name} · <a className="text-[#0085FF]" href={`mailto:${detail.reporter.email}`}>{detail.reporter.email}</a></p>
                <p><span className="text-gray-400">Account:</span> {detail.tenant ? `${detail.tenant.name} (${detail.tenant.slug})` : '—'}</p>
                {detail.deviceInfo && <p><span className="text-gray-400">Device:</span> {detail.deviceInfo}</p>}
                <p className="break-all"><span className="text-gray-400">Page:</span> {detail.pageUrl ?? '—'}</p>
                <p className="break-all"><span className="text-gray-400">Browser:</span> {detail.userAgent ?? '—'}</p>
                <p><span className="text-gray-400">BoothGen version:</span> {detail.appVersion ?? '—'}</p>
              </div>

              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{detail.details}</p>
              <AttachmentList attachments={detail.attachments} />

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">Notes</p>
                <ReportThread notes={detail.notes} reporterName={detail.reporter.name} />
                <Textarea rows={3} value={note} maxLength={5000} onChange={e => setNote(e.target.value)} placeholder={internal ? 'Internal note (only Super Admins see it)' : 'Note to the reporter (they get an email)'} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Internal only
                  </label>
                  <Button onClick={addNote} disabled={!note.trim() || busy}>{internal ? 'Add internal note' : 'Send note'}</Button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-12 text-center text-sm text-gray-400">Pick a report to see it here.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
