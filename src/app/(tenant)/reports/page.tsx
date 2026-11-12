'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { REPORT_AREAS, REPORT_STATUSES, REPORT_TYPES, areaLabel, severityLabel, statusBadge, statusLabel, typeLabel } from '@/lib/reports/options';

type Row = {
  id: string; number: number; type: string; title: string; area: string; severity: string | null; status: string; priority: string | null;
  fixedInVersion: string | null; reporterName: string; followerCount: number; isMine: boolean; isFollowing: boolean; unread: boolean; updatedAt: string;
};

const SEV_VARIANT: Record<string, any> = { blocker: 'danger', major: 'warning', minor: 'default', cosmetic: 'default' };

// Shared board: everyone signed in sees every report, so the same issue isn't reported twice
export default function ReportsPage() {
  const [filters, setFilters] = useState({ status: 'open', type: '', area: '', q: '', mine: '' });
  const [reports, setReports] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    fetch('/api/reports?' + qs).then(r => r.json()).then(d => setReports(d.reports ?? [])).catch(() => setReports([]));
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, filters.q ? 250 : 0); return () => clearTimeout(t); }, [load, filters.q]);
  useEffect(() => {
    window.addEventListener('reports:changed', load);
    return () => window.removeEventListener('reports:changed', load);
  }, [load]);

  const setF = (k: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <>
      <TopBar title="Reports" />
      <div className="p-4 sm:p-8 max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">Bugs and suggestions from everyone using BoothGen. Check here first, and tap &ldquo;This is my issue too&rdquo; instead of sending the same thing again.</p>
          <Button className="shrink-0 whitespace-nowrap" onClick={() => setOpen(true)}>Report a bug / Suggest</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-60" placeholder="Search reports or #" value={filters.q} onChange={e => setF('q', e.target.value)} />
          <Select className="w-44" value={filters.status} onChange={e => setF('status', e.target.value)}>
            <option value="open">Open</option>
            <option value="all">All statuses</option>
            {REPORT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select className="w-36" value={filters.type} onChange={e => setF('type', e.target.value)}>
            <option value="">All types</option>
            {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Select className="w-56" value={filters.area} onChange={e => setF('area', e.target.value)}>
            <option value="">All parts</option>
            {REPORT_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
            <input type="checkbox" checked={filters.mine === '1'} onChange={e => setF('mine', e.target.checked ? '1' : '')} />Mine
          </label>
        </div>
        <Card>
          <CardContent className="p-0">
            {reports === null ? (
              <p className="px-6 py-8 text-sm text-gray-400">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">No reports match.</p>
            ) : (
              <div className="divide-y">
                {reports.map(r => (
                  <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${r.unread ? 'bg-[#E2445C]' : 'bg-transparent'}`} title={r.unread ? 'New update' : undefined} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${r.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>#{r.number} {r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {typeLabel(r.type)} · {areaLabel(r.area)} · by {r.isMine ? 'you' : r.reporterName} · updated {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.followerCount > 0 && (
                        <span className={`flex items-center gap-1 text-xs mr-1 ${r.isFollowing ? 'text-[#0085FF]' : 'text-gray-400'}`} title="Also have this issue">
                          <Users className="w-3.5 h-3.5" />+{r.followerCount}
                        </span>
                      )}
                      {r.severity && <Badge variant={SEV_VARIANT[r.severity]}>{severityLabel(r.severity)}</Badge>}
                      {r.priority && <Badge variant="brand">{r.priority}</Badge>}
                      <Badge variant={statusBadge(r.status)}>{statusLabel(r.status)}{r.status === 'fixed' && r.fixedInVersion ? ` · ${r.fixedInVersion}` : ''}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <ReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
