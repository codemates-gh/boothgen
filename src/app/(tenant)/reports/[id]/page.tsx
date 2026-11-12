'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentList, ReportThread, type ThreadNote } from '@/components/reports/ReportThread';
import { areaLabel, severityLabel, statusBadge, statusLabel, typeLabel } from '@/lib/reports/options';

type Report = {
  id: string; number: number; type: string; title: string; area: string; severity: string | null; deviceInfo: string | null; details: string;
  status: string; fixedInVersion: string | null; createdAt: string; updatedAt: string;
  attachments: { index: number; name: string; contentType: string; bytes: number; url: string }[]; notes: ThreadNote[];
};

export default function ReportPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/reports/${params.id}`)
      .then(async r => { if (!r.ok) { setMissing(true); return; } setReport((await r.json()).report); window.dispatchEvent(new Event('reports:changed')); })
      .catch(() => setMissing(true));
  }, [params.id]);

  async function send() {
    setSending(true);
    setError('');
    const res = await fetch(`/api/reports/${params.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) { setError(d.error || 'Could not send'); return; }
    setReport(d.report);
    setReply('');
  }

  return (
    <>
      <TopBar title="My reports" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />All my reports</Link>
        {missing && <p className="text-sm text-gray-500">This report wasn&apos;t found.</p>}
        {report && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle>#{report.number} {report.title}</CardTitle>
                  <Badge variant={statusBadge(report.status)}>{statusLabel(report.status)}</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  {typeLabel(report.type)} · {areaLabel(report.area)}{report.severity ? ` · ${severityLabel(report.severity)}` : ''} · sent {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
                {report.status === 'fixed' && report.fixedInVersion && <p className="text-sm text-green-700 mt-1">Fixed in version {report.fixedInVersion}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                {report.deviceInfo && <p className="text-xs text-gray-500">Device: {report.deviceInfo}</p>}
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{report.details}</p>
                <AttachmentList attachments={report.attachments} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Updates</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ReportThread notes={report.notes} reporterName="You" />
                <div className="space-y-2 pt-2">
                  <Textarea rows={3} value={reply} maxLength={5000} onChange={e => setReply(e.target.value)} placeholder={report.status === 'need_info' ? 'Add the details the team asked for…' : 'Add more information…'} />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex justify-end"><Button onClick={send} disabled={!reply.trim() || sending}>{sending ? 'Sending…' : 'Reply'}</Button></div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
