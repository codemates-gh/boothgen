'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileImage, ArrowLeft, CheckCircle2, Clock, MessageSquare, Trash2, Bell } from 'lucide-react';
import Link from 'next/link';

const STATUS_VARIANT: Record<string, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'info',
  REVISION_REQUESTED: 'warning',
  APPROVED: 'success',
};

export default function TemplateDesignsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [designs, setDesigns] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [reminding, setReminding] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState<string | null>(null);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    const r = await fetch('/api/events/' + eventId + '/template-designs');
    if (r.ok) setDesigns(await r.json());
  }

  async function deleteDesign(id: string) {
    if (!confirm('Delete this design version? This cannot be undone.')) return;
    const res = await fetch('/api/template-designs/' + id, { method: 'DELETE' });
    if (res.ok) {
      setDesigns(prev => prev.filter(d => d.id !== id));
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to delete design.');
    }
  }

  async function uploadFile(file: File) {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/events/' + eventId + '/template-designs/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Upload failed');
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    }
    setUploading(false);
  }

  async function sendReminder(designId: string) {
    setReminding(designId);
    const res = await fetch('/api/template-designs/' + designId + '/remind', { method: 'POST' });
    if (res.ok) {
      setReminderSent(designId);
      setTimeout(() => setReminderSent(null), 3000);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to send reminder');
    }
    setReminding(null);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [eventId]);

  const latestDesign = designs[0] ?? null;
  // Can upload a new version when there's no design, client requested revision, or design is approved and a new version is needed
  const canUpload = !latestDesign || latestDesign.status === 'REVISION_REQUESTED' || latestDesign.status === 'APPROVED';

  return (
    <>
      <TopBar title="Template Designs" />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <Link href={'/events/' + eventId} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />Back to Event
        </Link>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>
        )}

        {/* Upload area — shown when a new version can be uploaded */}
        {canUpload && (
          <Card>
            <CardHeader>
              <CardTitle>{designs.length === 0 ? 'Upload Design' : 'Upload New Version'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={
                  'border-2 border-dashed rounded-xl p-12 text-center transition-colors ' +
                  (dragOver ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300')
                }
              >
                {uploading ? (
                  <div className="space-y-2">
                    <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-gray-500">Uploading…</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-600 font-medium">Drop a file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Images and PDF files supported — uploading automatically sends to client for review</p>
                    <label className="mt-4 inline-block cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                      />
                      <span className="mt-4 inline-block px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
                        Browse File
                      </span>
                    </label>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending approval banner — upload blocked while client is reviewing */}
        {latestDesign?.status === 'PENDING_APPROVAL' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-800">Awaiting client review</p>
              <p className="text-sm text-blue-600">Version {latestDesign.version} has been sent to the client. You can upload a new version once they respond.</p>
            </div>
          </div>
        )}

        {/* Version history */}
        {designs.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Design History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {designs.map(d => (
                  <div key={d.id} className="p-5 flex items-start gap-4">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5 border border-gray-200">
                      {/\.(jpe?g|png|gif|webp)$/i.test(d.filename) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.fileUrl} alt={d.filename} className="w-full h-full object-cover" />
                      ) : (
                        <FileImage className="w-6 h-6 text-gray-400" />
                      )}
                      {d.status !== 'APPROVED' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="text-white text-[9px] font-bold tracking-widest rotate-[-25deg] border border-white/70 px-1 py-0.5 rounded uppercase">
                            {d.status === 'PENDING_APPROVAL' ? 'Review' : d.status === 'REVISION_REQUESTED' ? 'Revision' : 'Draft'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">Version {d.version}</span>
                        <Badge variant={STATUS_VARIANT[d.status] as any}>
                          {d.status.replace(/_/g, ' ')}
                        </Badge>
                        {d.approvedAt && (
                          <span className="text-xs text-green-600">
                            Approved {new Date(d.approvedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{d.filename}</p>
                      {d.revisionNote && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center gap-1.5 mb-1">
                            <MessageSquare className="w-3 h-3 text-amber-600" />
                            <p className="text-xs font-semibold text-amber-800">Client feedback</p>
                          </div>
                          <p className="text-sm text-amber-700">{d.revisionNote}</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5">
                        {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <a
                        href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View file ↗
                      </a>
                      {d.status === 'PENDING_APPROVAL' && (
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-xs text-blue-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />Awaiting client
                          </span>
                          <button
                            onClick={() => sendReminder(d.id)}
                            disabled={reminding === d.id}
                            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium disabled:opacity-50"
                          >
                            <Bell className="w-3 h-3" />
                            {reminderSent === d.id ? 'Sent!' : reminding === d.id ? 'Sending…' : 'Send reminder'}
                          </button>
                        </div>
                      )}
                      {d.status === 'APPROVED' && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />Approved
                        </span>
                      )}
                      {d.status !== 'APPROVED' && (
                        <button
                          onClick={() => deleteDesign(d.id)}
                          title="Delete this version"
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
