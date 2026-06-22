'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Image, Trash2, Globe, EyeOff, X, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function GalleryDetailPage({ params }: { params: { id: string } }) {
  const [gallery, setGallery] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { load(); }, [params.id]);

  async function load() {
    const [gr, ar] = await Promise.all([
      fetch('/api/gallery/' + params.id).then(r => r.json()),
      fetch('/api/gallery/' + params.id + '/assets').then(r => r.json()),
    ]);
    setGallery(gr); setAssets(ar);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const id = file.name + Date.now();
      setUploadProgress(p => ({ ...p, [id]: 0 }));
      try {
        // Get presigned URL
        const { uploadUrl, key, publicUrl } = await fetch('/api/gallery/' + params.id + '/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        }).then(r => r.json());
        // Upload to R2
        await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        setUploadProgress(p => ({ ...p, [id]: 80 }));
        // Save asset record
        await fetch('/api/gallery/' + params.id + '/assets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: publicUrl, fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        setUploadProgress(p => ({ ...p, [id]: 100 }));
        setTimeout(() => setUploadProgress(p => { const n = {...p}; delete n[id]; return n; }), 1500);
      } catch (err) { console.error('Upload failed:', err); }
    }
    setUploading(false); load();
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
            <Button variant="outline" onClick={togglePublish}>
              {gallery?.isPublished ? <><EyeOff className="w-4 h-4 mr-2"/>Unpublish</> : <><Globe className="w-4 h-4 mr-2"/>Publish to Client</>}
            </Button>
          </div>
        </div>

        {gallery && (
          <div className="flex items-center gap-4">
            <div><h2 className="text-xl font-bold">{gallery.title}</h2><p className="text-sm text-gray-500">{assets.length} photos</p></div>
            <Badge variant={gallery.isPublished ? 'success' : 'default'}>{gallery.isPublished ? 'Published' : 'Draft'}</Badge>
          </div>
        )}

        {/* Upload zone */}
        <div
          onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={'border-2 border-dashed rounded-2xl p-10 text-center transition-colors ' + (dragOver ? 'border-brand bg-brand-surface' : 'border-gray-300 hover:border-brand hover:bg-gray-50')}>
          <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400"/>
          <p className="font-semibold text-gray-700 mb-1">Drop photos here or click to upload</p>
          <p className="text-sm text-gray-400 mb-4">JPG, PNG, WEBP — stored on Cloudflare R2</p>
          <label className="cursor-pointer">
            <input type="file" multiple accept="image/*" className="sr-only" onChange={e => uploadFiles(e.target.files)}/>
            <span className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors">Choose Photos</span>
          </label>
        </div>

        {/* Upload progress */}
        {Object.entries(uploadProgress).length > 0 && (
          <Card><CardContent className="p-4 space-y-2">
            {Object.entries(uploadProgress).map(([id, progress]) => (
              <div key={id} className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2"><div className="bg-brand h-2 rounded-full transition-all" style={{ width: progress + '%' }}/></div>
                {progress === 100 && <CheckCircle2 className="w-4 h-4 text-green-500"/>}
                <span className="text-xs text-gray-500">{progress}%</span>
              </div>
            ))}
          </CardContent></Card>
        )}

        {/* Photo grid */}
        {assets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.map(a => (
              <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={a.url} alt={a.filename} className="w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button onClick={() => deleteAsset(a.id)} className="p-2 bg-red-500 rounded-lg text-white hover:bg-red-600">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {assets.length === 0 && !uploading && (
          <div className="text-center py-12 text-gray-400"><Image className="w-10 h-10 mx-auto mb-3 opacity-30"/><p>No photos yet. Upload photos above.</p></div>
        )}
      </div>
    </>
  );
}
