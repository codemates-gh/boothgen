'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, RotateCcw, Download,
  Users, Calendar, ArrowRight, Check, X, Info,
} from 'lucide-react';
import { SAMPLE_CSV } from '@/lib/import/parse';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];

// ── types ─────────────────────────────────────────────────────────────────────

interface PreviewStats {
  totalRows: number; validRows: number; skippedRows: number;
  newClients: number; returningClients: number;
  withEvents: number; pastEvents: number; futureEvents: number;
}

interface ParsedRow {
  rowIndex: number;
  firstName: string; lastName: string; email: string; phone: string; company: string;
  eventTitle: string; eventDateIso: string | null;
  venueName: string; packageName: string; internalNotes: string;
  startTimeStr: string; endTimeStr: string;
  guestCount: number | null; error: string | null;
}

interface PreviewResponse {
  filename: string;
  headers: string[];
  detectedFields: string[];
  mapping: Record<string, number>;
  rows: ParsedRow[];
  preview: ParsedRow[];
  stats: PreviewStats;
  error?: string;
}

interface ImportResult {
  batchId: string;
  clientsCreated: number;
  eventsCreated: number;
  rowsSkipped: number;
  runtimeErrors: Array<{ row: number; reason: string }>;
  canUndoUntil: string;
  error?: string;
}

// ── field labels for detected-columns display ─────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name', lastName: 'Last Name', clientName: 'Client Name',
  email: 'Email', phone: 'Phone', company: 'Company',
  eventTitle: 'Event Name', eventDate: 'Event Date',
  venueName: 'Venue', venueAddress: 'Venue Address', venueCity: 'City', venueState: 'State',
  startTime: 'Start Time', endTime: 'End Time',
  packageName: 'Package', internalNotes: 'Notes', guestCount: 'Guest Count',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'boothgenius-import-template.csv';
  a.click(); URL.revokeObjectURL(url);
}

function downloadErrors(errors: Array<{ row: number; reason: string }>, previewRows: ParsedRow[]) {
  const allErrors = [
    ...previewRows.filter(r => r.error).map(r => ({ row: r.rowIndex, reason: r.error! })),
    ...errors,
  ];
  const csv = 'Row,Error\r\n' + allErrors.map(e => `${e.row},"${e.reason.replace(/"/g, '""')}"`).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'import-errors.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ── main component ────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'results';

export default function ImportPage() {
  const [step, setStep]           = useState<Step>('upload');
  const [preview, setPreview]     = useState<PreviewResponse | null>(null);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [undoing, setUndoing]     = useState(false);
  const [undone, setUndone]       = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd });
      const data: PreviewResponse = await res.json();
      if (!res.ok || data.error) { setUploadError(data.error ?? 'Failed to parse file'); return; }
      setPreview(data);
      setStep('preview');
    } catch {
      setUploadError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  }, []);

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.rows, filename: preview.filename }),
      });
      const data: ImportResult = await res.json();
      setResult(data);
      setStep('results');
    } catch {
      setResult({ batchId: '', clientsCreated: 0, eventsCreated: 0, rowsSkipped: 0, runtimeErrors: [], canUndoUntil: '', error: 'Import failed. Please try again.' });
      setStep('results');
    } finally {
      setImporting(false);
    }
  }

  async function handleUndo() {
    if (!result?.batchId) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/import/${result.batchId}/undo`, { method: 'POST' });
      if (res.ok) setUndone(true);
    } finally {
      setUndoing(false);
    }
  }

  function reset() {
    setStep('upload'); setPreview(null); setResult(null);
    setUndone(false); setUploadError(null);
  }

  const canUndo = result?.batchId && result.canUndoUntil && new Date() < new Date(result.canUndoUntil) && !undone;

  return (
    <div>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Settings tab bar */}
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {TABS.map(([href, label]) => (
            <Link key={href} href={'/settings/' + href}
              className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'import' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
              {label}
            </Link>
          ))}
        </div>

        <div className="max-w-3xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import Clients & Events</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload a CSV or Excel file to migrate your existing clients and bookings into Booth Genius.
              Clients who already exist in your account will have new events added without creating duplicates.
            </p>
          </div>

          {/* ── STEP 1: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand bg-brand/5' : 'border-gray-300 hover:border-brand hover:bg-gray-50'}`}
              >
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileInput} />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Parsing file…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-brand" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Drop your file here, or click to browse</p>
                      <p className="text-sm text-gray-400 mt-1">Supports .csv, .xlsx, .xls</p>
                    </div>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {uploadError}
                </div>
              )}

              {/* instructions + sample */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Info className="w-4 h-4" /> How it works
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-gray-600 space-y-3">
                  <p>Your file can have <strong>any column names</strong> — Booth Genius will automatically detect common variations like "Email Address", "e-mail", "Mobile", "Phone Number", etc.</p>
                  <p>Each row should represent <strong>one booking</strong>. If a client has multiple bookings, use one row per booking with the same email address — only one client record will be created.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <p className="font-medium text-gray-800 mb-1">Client fields</p>
                      <ul className="text-xs text-gray-500 space-y-0.5">
                        <li>• <strong>Email</strong> — required, used to detect duplicates</li>
                        <li>• First Name / Last Name <em>or</em> Full Name</li>
                        <li>• Phone, Company</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 mb-1">Event fields <span className="font-normal text-gray-400">(optional)</span></p>
                      <ul className="text-xs text-gray-500 space-y-0.5">
                        <li>• Event Name, Event Date</li>
                        <li>• Start Time, End Time</li>
                        <li>• Venue, Address, City, State</li>
                        <li>• Package, Notes, Guest Count</li>
                      </ul>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button onClick={downloadSample} className="inline-flex items-center gap-1.5 text-brand text-sm font-medium hover:underline">
                      <Download className="w-3.5 h-3.5" /> Download sample template
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {step === 'preview' && preview && (
            <div className="space-y-5">
              {/* file + detected columns */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4" /> {preview.filename}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">Detected columns</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(FIELD_LABELS).map(field => {
                        const detected = field in preview.mapping;
                        return (
                          <span key={field} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${detected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400'}`}>
                            {detected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {FIELD_LABELS[field]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={<Users className="w-4 h-4 text-brand" />} label="New clients" value={preview.stats.newClients} />
                <StatCard icon={<Users className="w-4 h-4 text-green-500" />} label="Already in Booth Genius" value={preview.stats.returningClients} sub="Events will be added" />
                <StatCard icon={<Calendar className="w-4 h-4 text-blue-500" />} label="Events to create" value={preview.stats.withEvents} sub={`${preview.stats.futureEvents} upcoming · ${preview.stats.pastEvents} past`} />
              </div>

              {preview.stats.skippedRows > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span><strong>{preview.stats.skippedRows} row{preview.stats.skippedRows !== 1 ? 's' : ''}</strong> will be skipped due to validation errors (missing or invalid email). The remaining {preview.stats.validRows} rows will still be imported.</span>
                </div>
              )}

              {/* preview table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Preview — first {Math.min(5, preview.preview.length)} rows</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500">#</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Client</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Email</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Event</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map(row => (
                        <tr key={row.rowIndex} className={`border-b last:border-0 ${row.error ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2 text-gray-400">{row.rowIndex}</td>
                          <td className="px-4 py-2 font-medium">{row.firstName} {row.lastName}</td>
                          <td className="px-4 py-2 text-gray-500">{row.email}</td>
                          <td className="px-4 py-2 text-gray-600 max-w-[140px] truncate">{row.eventTitle || '—'}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                            {row.eventDateIso ? new Date(row.eventDateIso).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-2">
                            {row.error
                              ? <span className="text-red-600 font-medium">{row.error}</span>
                              : row.eventDateIso
                                ? <Badge variant={new Date(row.eventDateIso) < new Date() ? 'default' : 'info'}>{new Date(row.eventDateIso) < new Date() ? 'COMPLETED' : 'BOOKED'}</Badge>
                                : <span className="text-gray-400">Client only</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.stats.totalRows > 5 && (
                    <p className="px-4 py-2 text-xs text-gray-400 border-t">…and {preview.stats.totalRows - 5} more rows</p>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleImport} disabled={importing || preview.stats.validRows === 0}>
                  {importing ? (
                    <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />Importing…</span>
                  ) : (
                    <span className="flex items-center gap-2">Import {preview.stats.validRows} record{preview.stats.validRows !== 1 ? 's' : ''} <ArrowRight className="w-4 h-4" /></span>
                  )}
                </Button>
                <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: RESULTS ── */}
          {step === 'results' && result && (
            <div className="space-y-5">
              {result.error ? (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Import failed</p>
                    <p className="text-sm mt-1">{result.error}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Import complete</p>
                      <p className="text-sm mt-0.5">
                        {result.clientsCreated} client{result.clientsCreated !== 1 ? 's' : ''} created
                        · {result.eventsCreated} event{result.eventsCreated !== 1 ? 's' : ''} created
                        {result.rowsSkipped > 0 && ` · ${result.rowsSkipped} row${result.rowsSkipped !== 1 ? 's' : ''} skipped`}
                      </p>
                    </div>
                  </div>

                  {/* skipped rows from validation + runtime errors */}
                  {(preview && preview.rows.some(r => r.error)) || result.runtimeErrors.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
                          <AlertTriangle className="w-4 h-4" />
                          Skipped rows
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left px-4 py-2 font-medium text-gray-500">Row</th>
                              <th className="text-left px-4 py-2 font-medium text-gray-500">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview?.rows.filter(r => r.error).map(r => (
                              <tr key={r.rowIndex} className="border-b last:border-0">
                                <td className="px-4 py-2 text-gray-500">{r.rowIndex}</td>
                                <td className="px-4 py-2 text-red-600">{r.error}</td>
                              </tr>
                            ))}
                            {result.runtimeErrors.map(e => (
                              <tr key={e.row} className="border-b last:border-0">
                                <td className="px-4 py-2 text-gray-500">{e.row}</td>
                                <td className="px-4 py-2 text-red-600">{e.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="px-4 py-3 border-t">
                          <button
                            onClick={() => downloadErrors(result.runtimeErrors, preview?.rows ?? [])}
                            className="inline-flex items-center gap-1.5 text-xs text-brand font-medium hover:underline"
                          >
                            <Download className="w-3.5 h-3.5" /> Download error report
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {/* undo */}
                  {canUndo && (
                    <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                      <RotateCcw className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">Changed your mind?</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          You can undo this entire import until {new Date(result.canUndoUntil).toLocaleString()}.
                          This will delete all clients and events created by this import.
                          Clients who already existed in your account will not be affected.
                        </p>
                        <button
                          onClick={handleUndo}
                          disabled={undoing}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {undoing ? 'Undoing…' : 'Undo this import'}
                        </button>
                      </div>
                    </div>
                  )}

                  {undone && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Import undone — all imported clients and events have been removed.
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <Link href="/clients">
                  <Button variant="outline">View Clients</Button>
                </Link>
                <Link href="/events">
                  <Button variant="outline">View Events</Button>
                </Link>
                <button onClick={reset} className="text-sm text-brand font-medium hover:underline flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> Import another file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-gray-500">{label}</p></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
