'use client';
import { useState, useEffect, useCallback, use } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Image, Trash2, Globe, EyeOff, X, CheckCircle2, Lock, LockOpen, Link2 } from 'lucide-react';
import Link from 'next/link';
import { AssetThumb } from '@/components/gallery/AssetMedia';
import { WEB_UPLOAD_TYPES, DEFAULT_UPLOAD_LIMITS, galleryRules, maxBytesFor, isMotion, formatBytes, type UploadLimits } from '@/lib/gallery/uploadLimits';

export default function GalleryDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [gallery, setGallery] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  // Filter by where photos came from: the Genie booth, PC booth software (Sharing station) or uploaded here
  const [source, setSource] = useState<'' | 'genie' | 'pcBooth' | 'upload'>('');
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState({ done: 0, total: 0, failed: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [codeSaved, setCodeSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => { load(); }, [params.id]);

  async function load() {
    const [gr, ar] = await Promise.all([
      fetch('/api/gallery/' + params.id).then(r => r.json()),
      fetch('/api/gallery/' + params.id + '/assets').then(r => r.json()),
    ]);
    setGallery(gr); setAssets(ar);
    setAccessCode(gr.accessCode ?? '');
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Check type and size here first, so a skipped file says why (the server checks again)
    const all = Array.from(files);
    const limits: UploadLimits = gallery?.uploadLimits ?? DEFAULT_UPLOAD_LIMITS;
    const imageFiles = all.filter(f => WEB_UPLOAD_TYPES.includes(f.type) && f.size <= maxBytesFor(f.type, limits));
    const skipped = all.filter(f => !imageFiles.includes(f));
    const skippedNote = skipped.length === 0 ? null
      : `Skipped ${skipped.length} file${skipped.length === 1 ? '' : 's'}: ` + skipped.slice(0, 3).map(f => WEB_UPLOAD_TYPES.includes(f.type) ? `${f.name} (${formatBytes(f.size)}, over ${formatBytes(maxBytesFor(f.type, limits))} for ${isMotion(f.type) ? 'GIFs and videos' : 'photos'})` : `${f.name} (not a photo, GIF or video)`).join(', ') + (skipped.length > 3 ? ', …' : '') + '.';
    if (imageFiles.length === 0) { setUploadCount({ done: 0, total: 0, failed: 0 }); setUploadError(skippedNote); return; }

    setUploading(true);
    setUploadCount({ done: 0, total: imageFiles.length, failed: 0 });
    setUploadError(skippedNote);

    const saved: Array<{ url: string; fileName: string; fileSize: number; mimeType: string }> = [];
    let firstError: string | null = null;

    async function uploadOne(file: File) {
      try {
        // Step 1: get presigned URL
        const presignRes = await fetch('/api/gallery/' + params.id + '/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, bytes: file.size }),
        });
        if (!presignRes.ok) {
          const body = await presignRes.json().catch(() => ({}));
          throw new Error(body.upgrade || body.rule ? body.error : 'Presign failed (' + presignRes.status + '): ' + (body.error ?? 'unknown'));
        }
        const { uploadUrl, publicUrl } = await presignRes.json();

        // Step 2: PUT directly to R2
        const r2Res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
          .catch((e: any) => { throw new Error('R2 PUT failed → ' + uploadUrl.split('?')[0] + ' — ' + (e?.message ?? e)); });
        if (!r2Res.ok) throw new Error('R2 upload failed (' + r2Res.status + ') → ' + uploadUrl.split('?')[0]);

        saved.push({ url: publicUrl, fileName: file.name, fileSize: file.size, mimeType: file.type });
        setUploadCount(c => ({ ...c, done: c.done + 1 }));
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('Upload failed:', file.name, msg);
        if (!firstError) {
          firstError = msg;
          setUploadError(e => (e ? e + ' ' : '') + msg);
        }
        setUploadCount(c => ({ ...c, done: c.done + 1, failed: c.failed + 1 }));
      }
    }

    const CONCURRENCY = 5;
    for (let i = 0; i < imageFiles.length; i += CONCURRENCY) {
      await Promise.all(imageFiles.slice(i, i + CONCURRENCY).map(uploadOne));
    }

    // Save all successful asset records in one batch call
    if (saved.length > 0) {
      await fetch('/api/gallery/' + params.id + '/assets/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: saved }),
      });
    }

    setUploading(false);
    load();
  }

  async function togglePublish() {
    await fetch('/api/gallery/' + params.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !gallery?.isPublished }),
    });
    load();
  }

  async function deleteAsset(assetId: string) {
    if (!confirm('Delete this photo?')) return;
    await fetch('/api/gallery/' + params.id + '/assets/' + assetId, { method: 'DELETE' });
    load();
  }

  async function saveAccessCode() {
    setSavingCode(true);
    await fetch('/api/gallery/' + params.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: accessCode.trim() || null }),
    });
    setSavingCode(false); setCodeSaved(true);
    setTimeout(() => setCodeSaved(false), 2000);
    load();
  }

  function copyGalleryLink() {
    const shareToken = gallery?.clientToken;
    if (!shareToken) return;
    const url = window.location.origin + '/g/' + shareToken;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function deleteAllPhotos() {
    if (!confirm(`Delete all ${assets.length} photos? This cannot be undone.`)) return;
    setDeletingAll(true);
    await fetch('/api/gallery/' + params.id + '/assets', { method: 'DELETE' });
    setDeletingAll(false);
    load();
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }, [params.id]);

  return (
    <>
      <TopBar title={gallery?.title || 'Gallery'}/>
      <div className="p-8 max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/gallery" className="text-sm text-gray-500 hover:text-gray-700">← Gallery</Link>
          <div className="flex gap-3">
            {gallery?.isPublished && (
              <Button variant="outline" size="sm" onClick={copyGalleryLink}>
                {linkCopied ? <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500"/>Copied!</> : <><Link2 className="w-4 h-4 mr-2"/>Share Gallery Link</>}
              </Button>
            )}
            <Button variant="outline" onClick={togglePublish}>
              {gallery?.isPublished ? <><EyeOff className="w-4 h-4 mr-2"/>Unpublish</> : <><Globe className="w-4 h-4 mr-2"/>Publish to Client</>}
            </Button>
          </div>
        </div>

        {gallery && (
          <div className="flex items-center gap-4">
            <div><h2 className="text-xl font-bold">{gallery.title}</h2><p className="text-sm text-gray-500">{assets.length} photos</p></div>
            <Badge variant={gallery.isPublished ? 'success' : 'default'}>{gallery.isPublished ? 'Published' : 'Draft'}</Badge>
            {gallery.accessCode && <Badge variant="warning" className="flex items-center gap-1"><Lock className="w-3 h-3"/>Protected</Badge>}
          </div>
        )}

        {/* Access code */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {gallery?.accessCode ? <Lock className="w-4 h-4 text-orange-500"/> : <LockOpen className="w-4 h-4 text-gray-400"/>}
              Password Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">Set an access code that clients must enter before viewing gallery photos. Leave blank for public access.</p>
            <div className="flex gap-3 max-w-sm">
              <input
                type="text"
                placeholder="e.g. SMITH2025"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value.toUpperCase())}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <Button size="sm" onClick={saveAccessCode} disabled={savingCode}>
                {codeSaved ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500"/>Saved</> : savingCode ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {gallery?.accessCode && (
              <button
                onClick={async () => {
                  setAccessCode('');
                  await fetch('/api/gallery/' + params.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode: null }) });
                  load();
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Remove access code
              </button>
            )}
          </CardContent>
        </Card>

        {/* Retention reminder */}
        {gallery && gallery.event?.eventDate && (
          (() => {
            const eventDate   = new Date(gallery.event.eventDate);
            const expireDays  = gallery.expireDays  ?? 30;
            const deleteDays  = gallery.deleteDays  ?? 30;
            const expireDate  = new Date(eventDate); expireDate.setDate(expireDate.getDate() + expireDays);
            const deleteDate  = new Date(expireDate); deleteDate.setDate(deleteDate.getDate() + deleteDays);
            const now         = new Date();
            const isExpired   = gallery.isExpired;
            const willExpire  = !isExpired && expireDate > now;
            const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${isExpired ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <span className="text-base mt-0.5">{isExpired ? '🔒' : '⏰'}</span>
                <div>
                  {isExpired ? (
                    <p><strong>Gallery expired</strong> — photos are hidden from the client portal but still stored until <strong>{fmt(deleteDate)}</strong>, then permanently deleted from storage.</p>
                  ) : (
                    <p>
                      Photos will be <strong>hidden from the client portal on {fmt(expireDate)}</strong> ({expireDays} days after the event)
                      {' '}and <strong>permanently deleted on {fmt(deleteDate)}</strong> ({expireDays + deleteDays} days after the event).
                      {' '}<span className="text-amber-600">Download or back up photos before then.</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Upload zone */}
        <div
          onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={'border-2 border-dashed rounded-2xl p-10 text-center transition-colors ' + (dragOver ? 'border-brand bg-brand-surface' : 'border-gray-300 hover:border-brand hover:bg-gray-50')}>
          <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400"/>
          <p className="font-semibold text-gray-700 mb-1">Drop photos here or click to upload</p>
          <p className="text-sm text-gray-400 mb-4">Photos up to {(gallery?.uploadLimits ?? DEFAULT_UPLOAD_LIMITS).photoMaxMb} MB · GIFs, boomerangs and videos up to {(gallery?.uploadLimits ?? DEFAULT_UPLOAD_LIMITS).motionMaxMb} MB</p>
          <label className="cursor-pointer">
            <input type="file" multiple accept={WEB_UPLOAD_TYPES.join(',')} className="sr-only" onChange={e => uploadFiles(e.target.files)}/>
            <span className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors">Choose Photos</span>
          </label>
        </div>

        <details className="text-xs text-gray-500 -mt-3">
          <summary className="cursor-pointer select-none hover:text-gray-700">Gallery upload rules</summary>
          <ul className="mt-2 ml-4 list-disc space-y-1">{galleryRules(gallery?.uploadLimits ?? DEFAULT_UPLOAD_LIMITS).map(r => <li key={r}>{r}</li>)}</ul>
        </details>

        {/* Upload progress */}
        {uploading && (
          <Card><CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">Uploading photos…</span>
              <span className="text-gray-500">{uploadCount.done} / {uploadCount.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-brand h-2.5 rounded-full transition-all"
                style={{ width: uploadCount.total ? (uploadCount.done / uploadCount.total * 100) + '%' : '0%' }}
              />
            </div>
            {uploadError && (
              <p className="text-xs text-red-600 bg-red-50 rounded p-2">{uploadError}</p>
            )}
          </CardContent></Card>
        )}
        {!uploading && (uploadCount.total > 0 || uploadError) && (
          <Card><CardContent className="p-4 space-y-2">
            {uploadCount.total > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4"/>
                {uploadCount.done - uploadCount.failed} of {uploadCount.total} photos uploaded
                {uploadCount.failed > 0 && <span className="text-red-500 ml-1">({uploadCount.failed} failed)</span>}
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 bg-red-50 rounded p-2">{uploadError}</p>
            )}
          </CardContent></Card>
        )}

        {/* Photo grid */}
        {assets.length > 0 && (
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={deleteAllPhotos} disabled={deletingAll} className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2"/>
                {deletingAll ? 'Deleting…' : `Delete All ${assets.length} Photos`}
              </Button>
            </div>
            {assets.some(a => a.source === 'pcBooth') && (
              <div className="flex flex-wrap gap-2">
                {([['', 'All'], ['genie', 'Genie booth'], ['pcBooth', 'PC booth'], ['upload', 'Uploaded']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setSource(v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${source === v ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {label} <span className="opacity-70">{assets.filter(a => sourceOf(a) === v || !v).length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {assets.filter(a => !source || sourceOf(a) === source).map(a => (
                <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <AssetThumb asset={a} alt={a.filename} className="w-full h-full object-cover"/>
                  {a.source === 'pcBooth' && (
                    <span className="absolute left-2 bottom-2 max-w-[85%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      PC booth{a.boothName ? ` · ${a.boothName}` : ''}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => deleteAsset(a.id)} className="p-2 bg-red-500 rounded-lg text-white hover:bg-red-600">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {assets.length === 0 && !uploading && (
          <div className="text-center py-12 text-gray-400"><Image className="w-10 h-10 mx-auto mb-3 opacity-30"/><p>No photos yet. Upload photos above.</p></div>
        )}
      </div>
    </>
  );
}

// Where a photo came from: PC booth software (Sharing station), the Genie booth, or uploaded on the website
function sourceOf(a: { source?: string | null; genieSessionId?: string | null }): 'pcBooth' | 'genie' | 'upload' {
  return a.source === 'pcBooth' ? 'pcBooth' : a.genieSessionId ? 'genie' : 'upload';
}
