'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Camera, Download, Lock, Image, X, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function GallerySharePage() {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => { load(); }, [token]);

  async function load(galleryCode?: string) {
    const url = '/api/g/' + token + (galleryCode ? '?code=' + encodeURIComponent(galleryCode) : '');
    const r = await fetch(url);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }

  async function unlock() {
    if (!code.trim()) return;
    setUnlocking(true);
    setCodeError('');
    const r = await fetch('/api/g/' + token + '?code=' + encodeURIComponent(code));
    if (r.ok) {
      const d = await r.json();
      if (d.gallery?.galleryUnlocked) {
        setData(d);
      } else {
        setCodeError('Incorrect access code. Please try again.');
      }
    }
    setUnlocking(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500">Loading gallery…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-700 mb-2">Gallery not found</p>
        <p className="text-gray-500">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  const { gallery, event, branding, assets } = data;
  const pc = branding?.primaryColor || '#F97316';
  const companyName = branding?.companyName || 'Photo Booth Co.';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding?.logoUrl
              ? <img src={branding.logoUrl} alt={companyName} className="h-10 object-contain"/>
              : <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: pc }}>
                  <Camera className="w-5 h-5 text-white"/>
                </div>}
            <div>
              <p className="font-bold text-gray-900">{companyName}</p>
              <p className="text-xs text-gray-500">Photo Gallery</p>
            </div>
          </div>
          {event?.title && (
            <p className="text-sm font-semibold text-gray-700 text-right">{event.title}</p>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {gallery.isExpired ? (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400"/>
            <p className="text-lg font-bold text-gray-800 mb-2">Gallery Expired</p>
            <p className="text-sm text-gray-500">The access period for this gallery has ended.</p>
          </div>
        ) : !gallery.isPublished ? (
          <div className="text-center py-20 text-gray-400">
            <Image className="w-12 h-12 mx-auto mb-4 opacity-30"/>
            <p className="text-lg font-semibold">Gallery not available yet</p>
            <p className="text-sm mt-2">Check back after the event.</p>
          </div>
        ) : gallery.requiresAccessCode && !gallery.galleryUnlocked ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2" style={{ backgroundColor: pc + '20' }}>
              <Lock className="w-8 h-8" style={{ color: pc }}/>
            </div>
            <p className="text-lg font-bold text-gray-900">Gallery is Password Protected</p>
            <p className="text-sm text-gray-500">Enter the access code provided by your host.</p>
            <div className="w-full max-w-xs space-y-3">
              <input
                type="text"
                placeholder="Enter access code"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && unlock()}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2"
              />
              {codeError && <p className="text-sm text-red-600 text-center">{codeError}</p>}
              <button
                onClick={unlock}
                disabled={unlocking || !code.trim()}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: pc }}
              >
                {unlocking ? 'Verifying…' : 'Unlock Gallery'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{gallery.title}</h1>
                <p className="text-sm text-gray-500">{assets.length} photos</p>
              </div>
              {assets.length > 0 && (
                <button
                  onClick={async () => {
                    const JSZip = (await import('jszip')).default;
                    const zip = new JSZip();
                    const folder = zip.folder('gallery') as any;
                    await Promise.all(assets.map(async (a: any, i: number) => {
                      try {
                        const res = await fetch(a.url);
                        const blob = await res.blob();
                        const ext = a.url.split('.').pop()?.split('?')[0] || 'jpg';
                        folder.file(`photo-${i + 1}.${ext}`, blob);
                      } catch {}
                    }));
                    const content = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(content);
                    const link = document.createElement('a');
                    link.href = url; link.download = 'gallery.zip'; link.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4"/>Download All
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {assets.map((a: any, i: number) => (
                <div
                  key={a.id}
                  className="relative group aspect-square rounded-xl overflow-hidden cursor-pointer bg-gray-100"
                  onClick={() => setLightboxIndex(i)}
                >
                  <img src={a.url} alt="" className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"/>
                </div>
              ))}
            </div>

            {assets.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Image className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p>No photos available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && data.assets && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10" onClick={() => setLightboxIndex(null)}>
            <X className="w-6 h-6"/>
          </button>
          <span className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-sm">{lightboxIndex + 1} / {assets.length}</span>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10"
              onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
            >
              <ChevronRight className="w-8 h-8 rotate-180"/>
            </button>
          )}
          <img
            src={assets[lightboxIndex].url}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {lightboxIndex < assets.length - 1 && (
            <button
              className="absolute right-4 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10"
              onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
            >
              <ChevronRight className="w-8 h-8"/>
            </button>
          )}
          <a
            href={assets[lightboxIndex].url}
            download={`photo-${lightboxIndex + 1}.jpg`}
            className="absolute bottom-5 right-1/2 translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-4 h-4"/> Download
          </a>
        </div>
      )}
    </div>
  );
}
