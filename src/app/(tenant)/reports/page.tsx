'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { areaLabel, statusBadge, statusLabel, typeLabel } from '@/lib/reports/options';

type Row = { id: string; number: number; type: string; title: string; area: string; status: string; fixedInVersion: string | null; unread: boolean; updatedAt: string };

export default function MyReportsPage() {
  const [reports, setReports] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => fetch('/api/reports').then(r => r.json()).then(d => setReports(d.reports ?? [])).catch(() => setReports([]));
    load();
    window.addEventListener('reports:changed', load);
    return () => window.removeEventListener('reports:changed', load);
  }, []);

  return (
    <>
      <TopBar title="My reports" />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">Bugs and suggestions you sent, with updates from the Booth Genius team.</p>
          <Button className="shrink-0 whitespace-nowrap" onClick={() => setOpen(true)}>Report a bug / Suggest</Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {reports === null ? (
              <p className="px-6 py-8 text-sm text-gray-400">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">No reports yet.</p>
            ) : (
              <div className="divide-y">
                {reports.map(r => (
                  <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${r.unread ? 'bg-[#E2445C]' : 'bg-transparent'}`} title={r.unread ? 'New update' : undefined} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${r.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>#{r.number} {r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{typeLabel(r.type)} · {areaLabel(r.area)} · updated {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}</p>
                    </div>
                    <Badge variant={statusBadge(r.status)}>{statusLabel(r.status)}{r.status === 'fixed' && r.fixedInVersion ? ` · ${r.fixedInVersion}` : ''}</Badge>
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
