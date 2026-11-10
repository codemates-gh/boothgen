'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Camera, Download, Image, AlertCircle } from 'lucide-react';
import { PoweredByBadge } from '@/components/brand/PoweredByBadge';

type Asset = { id: string; url: string; width: number | null; height: number | null; isGallery: boolean };

async function downloadFile(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href; link.download = name; link.click();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, '_blank');
  }
}

export default function GuestSessionPage() {
  const { token, sessionToken } = useParams<{ token: string; sessionToken: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const r = await fetch('/api/g/' + token + '/s/' + sessionToken);
      if (r.ok) {
        const d = await r.json();
        setData(d);
        // Photos may still be uploading from the booth; check again until they arrive
        if (d.assets.length === 0 && !d.isExpired) timer = setTimeout(load, 30000);
      }
      setLoading(false);
    }
    load();
    return () => clearTimeout(timer);
  }, [token, sessionToken]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500">Loading your photos…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-700 mb-2">Photos not found</p>
        <p className="text-gray-500">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  const { event, branding, assets, isExpired, printSheetUrl } = data as { event: any; branding: any; assets: Asset[]; isExpired: boolean; printSheetUrl: string | null };
  const pc = branding?.primaryColor || '#F97316';
  const companyName = branding?.companyName || 'Photo Booth Co.';
  const print = assets.find(a => a.isGallery);
  const shots = assets.filter(a => !a.isGallery);
  const fileName = (a: Asset, i: number) => (a.isGallery ? 'photo-booth' : 'photo-' + (i + 1)) + '.jpg';

  return (
    <div className="min-h-screen bg-gray-50">
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
              <p className="text-xs text-gray-500">Your Photos</p>
            </div>
          </div>
          {event?.title && <p className="text-sm font-semibold text-gray-700 text-right">{event.title}</p>}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {isExpired ? (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400"/>
            <p className="text-lg font-bold text-gray-800 mb-2">Photos Expired</p>
            <p className="text-sm text-gray-500">The access period for these photos has ended.</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Image className="w-12 h-12 mx-auto mb-4 opacity-30"/>
            <p className="text-lg font-semibold">Your photos are on their way</p>
            <p className="text-sm mt-2">The booth is still sending them. Check back in a few minutes — this page will update.</p>
            <p className="text-xs mt-6">Still nothing after an hour? Ask the event host.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h1 className="text-xl font-bold text-gray-900">Your Photos</h1>
              {assets.length > 1 && (
                <button
                  onClick={async () => {
                    const JSZip = (await import('jszip')).default;
                    const zip = new JSZip();
                    await Promise.all(assets.map(async a => {
                      try { zip.file(fileName(a, shots.indexOf(a)), await (await fetch(a.url)).blob()); } catch {}
                    }));
                    const href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
                    const link = document.createElement('a');
                    link.href = href; link.download = 'photos.zip'; link.click();
                    URL.revokeObjectURL(href);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4"/>Download All
                </button>
              )}
            </div>

            {print && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <img src={print.url} alt="Your print" className="w-full max-h-[75vh] object-contain rounded-lg"/>
                <button
                  onClick={() => downloadFile(print.url, fileName(print, 0))}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm"
                  style={{ backgroundColor: pc }}
                >
                  <Download className="w-4 h-4"/>Download
                </button>
                {printSheetUrl && (
                  <button onClick={() => downloadFile(printSheetUrl, 'print-sheet.jpg')} className="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline">
                    Download the printed sheet
                  </button>
                )}
              </div>
            )}

            {shots.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {shots.map((a, i) => (
                  <div key={a.id} className="relative rounded-xl overflow-hidden bg-gray-100">
                    <img src={a.url} alt="" className="w-full aspect-square object-cover"/>
                    <button
                      onClick={() => downloadFile(a.url, fileName(a, i))}
                      className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/70 text-white text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5"/>Save
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <PoweredByBadge />
    </div>
  );
}
