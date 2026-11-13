'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, ThumbsUp, Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentList, ReportThread, type ThreadNote } from '@/components/reports/ReportThread';
import { HowToFind } from '@/components/reports/HowToFind';
import { AttachmentPicker, useAttachments } from '@/components/reports/AttachmentPicker';
import { areaLabel, reporterStatusLabel, severityLabel, statusBadge, typeLabel } from '@/lib/reports/options';

type Report = {
  id: string; number: number; type: string; title: string; area: string; severity: string | null; deviceInfo: string | null; details: string;
  status: string; priority: string | null; fixedInVersion: string | null; howToFind: string | null; howToFindUrl: string | null;
  duplicateOf: { id: string; number: number; title: string } | null; createdAt: string;
  reporterName: string; voteCount: number; isMine: boolean; hasVoted: boolean; isFollowing: boolean; canVote: boolean; canReply: boolean;
  attachments: { index: number; name: string; contentType: string; bytes: number; url: string }[]; notes: ThreadNote[];
};

export default function ReportPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState('');
  const files = useAttachments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => fetch(`/api/reports/${params.id}`)
    .then(async r => { if (!r.ok) { setMissing(true); return; } setReport((await r.json()).report); window.dispatchEvent(new Event('reports:changed')); })
    .catch(() => setMissing(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [params.id]);

  async function send() {
    setBusy(true); setError('');
    const res = await fetch(`/api/reports/${params.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply, attachments: files.ready }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not send'); return; }
    setReport(d.report); setReply(''); files.reset();
  }

  async function toggle(kind: 'vote' | 'follow', on: boolean) {
    setBusy(true); setError('');
    const res = await fetch(`/api/reports/${params.id}/${kind}`, { method: on ? 'POST' : 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not save'); return; }
    await load();
  }

  return (
    <>
      <TopBar title="Reports" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />All reports</Link>
        {missing && <p className="text-sm text-gray-500">This report wasn&apos;t found.</p>}
        {report && (
          <>
            {report.status === 'exists' && report.howToFind && <HowToFind steps={report.howToFind} url={report.howToFindUrl} />}
            {report.status === 'duplicate' && report.duplicateOf && (
              <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
                Same as <Link className="text-[#0085FF] font-medium hover:underline" href={`/reports/${report.duplicateOf.id}`}>#{report.duplicateOf.number} {report.duplicateOf.title}</Link>. Updates continue there.
              </p>
            )}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle>#{report.number} {report.title}</CardTitle>
                  <div className="flex gap-1.5 shrink-0">
                    {report.priority && <Badge variant="brand">{report.priority}</Badge>}
                    <Badge variant={statusBadge(report.status)}>{reporterStatusLabel(report.status)}</Badge>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  {typeLabel(report.type)} · {areaLabel(report.area)}{report.severity ? ` · ${severityLabel(report.severity)}` : ''} · by {report.isMine ? 'you' : report.reporterName} · {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
                {report.status === 'fixed' && report.fixedInVersion && <p className="text-sm text-green-700 mt-1">Fixed in version {report.fixedInVersion}</p>}
                {report.status === 'fix_ready' && <p className="text-sm text-[#0073E6] mt-1">The fix is live{report.fixedInVersion ? ` in version ${report.fixedInVersion}` : ''}. Booth Genius is checking it; you can try it now.</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                {report.deviceInfo && <p className="text-xs text-gray-500">Device: {report.deviceInfo}</p>}
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{report.details}</p>
                <AttachmentList attachments={report.attachments} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-gray-500 flex items-center gap-1.5">
                    {report.type === 'suggestion' ? <ThumbsUp className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    {report.type === 'suggestion'
                      ? `${report.voteCount} ${report.voteCount === 1 ? 'vote' : 'votes'}`
                      : `${report.voteCount} ${report.voteCount === 1 ? 'person has' : 'people have'} this issue`}
                  </p>
                  {!report.isMine && (
                    <div className="flex items-center gap-3">
                      {(report.isFollowing || report.hasVoted) && (
                        <label className="flex items-center gap-2 text-xs text-gray-500">
                          <input type="checkbox" checked={report.isFollowing} disabled={busy} onChange={e => toggle('follow', e.target.checked)} />Email me updates
                        </label>
                      )}
                      {report.canVote ? (
                        report.hasVoted
                          ? <Button variant="outline" size="sm" disabled={busy} onClick={() => toggle('vote', false)}>{report.type === 'suggestion' ? 'Voted · Undo' : 'You have this too · Undo'}</Button>
                          : <Button size="sm" disabled={busy} onClick={() => toggle('vote', true)}>{report.type === 'suggestion' ? <><ThumbsUp className="w-3.5 h-3.5 mr-1.5" />Vote</> : 'This is my issue too'}</Button>
                      ) : report.status !== 'duplicate' && <span className="text-xs text-gray-400">Closed for votes</span>}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Updates</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ReportThread notes={report.notes} />
                {report.canReply ? (
                  <div className="space-y-2 pt-2">
                    <Textarea rows={3} value={reply} maxLength={5000} onChange={e => setReply(e.target.value)} onPaste={files.onPaste} placeholder={report.status === 'need_info' ? 'Add the details the team asked for…' : 'Add more information…'} />
                    <AttachmentPicker state={files} label="Attach screenshots" />
                    <p className="text-xs text-gray-400">Everyone using BoothGen can see this. Don&apos;t include guest phone numbers, emails or private photos.</p>
                    <div className="flex justify-end"><Button onClick={send} disabled={!reply.trim() || busy || files.uploading}>{busy ? 'Sending…' : files.uploading ? 'Uploading…' : 'Reply'}</Button></div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{report.type === 'suggestion' ? 'Vote for this suggestion' : 'Tap \u201cThis is my issue too\u201d'} to get updates and add details.</p>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
