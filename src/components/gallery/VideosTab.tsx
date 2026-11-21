'use client';
import { useState } from 'react';
import { Download, Eye, EyeOff, Play, Trash2, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Event gallery → Videos (Genie P14 Video Booth): every video message with its prompt, time and length; play, hide
// (from the public gallery and the guest's page) and delete. "Download all videos" is one ZIP streamed from storage.

export type VideoMessage = {
  id: string; url: string; thumbnailUrl: string | null; promptText: string | null; durationMs: number | null;
  createdAt: string; hiddenAt: string | null; width: number | null; height: number | null;
  // Genie 360 clips (P15) have genieMode spin360
  genieMode?: string | null;
  // Props on video (P14.1): the prop the guest wore (its name while it's still in the library)
  propId?: string | null; propName?: string | null;
};

const length = (ms: number | null) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function VideosTab({ galleryId, videos, showInGallery, onChange }: { galleryId: string; videos: VideoMessage[]; showInGallery: boolean | null; onChange: () => void }) {
  const [playing, setPlaying] = useState<VideoMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Video Booth messages and Genie 360 clips side by side; a filter once there are both
  const [kind, setKind] = useState<'all' | 'messages' | 'spin360'>('all');
  const spins = videos.filter(v => v.genieMode === 'spin360').length;
  const both = spins > 0 && spins < videos.length;
  const shown = videos.filter(v => kind === 'all' || (kind === 'spin360') === (v.genieMode === 'spin360'));

  async function setHidden(v: VideoMessage, hidden: boolean) {
    setBusy(v.id);
    await fetch(`/api/gallery/${galleryId}/assets/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) });
    setBusy(null);
    onChange();
  }
  async function remove(v: VideoMessage) {
    if (!confirm('Delete this video? It is removed from the guest\'s page and from storage. This cannot be undone.')) return;
    setBusy(v.id);
    await fetch(`/api/gallery/${galleryId}/assets/${v.id}`, { method: 'DELETE' });
    setBusy(null);
    onChange();
  }

  if (videos.length === 0) {
    return <div className="text-center py-12 text-gray-400"><Video className="w-10 h-10 mx-auto mb-3 opacity-30"/><p>No videos yet. Video Booth messages and Genie 360 videos show here.</p></div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          {videos.length} video{videos.length === 1 ? '' : 's'}
          {showInGallery === false && ` · ${spins ? 'messages are ' : ''}not shown in the public gallery (Video Booth setting)`}
          {showInGallery && ' · shown in the public gallery unless hidden'}
        </p>
        {both && (
          <div className="flex gap-1">
            {([['all', 'All'], ['messages', 'Video Booth'], ['spin360', '360']] as const).map(([v, label]) => (
              <Button key={v} type="button" size="sm" variant={kind === v ? 'default' : 'outline'} onClick={() => setKind(v)}>{label}</Button>
            ))}
          </div>
        )}
        <a href={`/api/gallery/${galleryId}/videos/zip`} download>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2"/>Download all videos</Button>
        </a>
      </div>
      <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
        {shown.map(v => (
          <div key={v.id} className={'flex items-center gap-4 p-3 ' + (v.hiddenAt ? 'opacity-60' : '')}>
            <button type="button" onClick={() => setPlaying(v)} className="relative w-24 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900" aria-label="Play">
              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover"/>}
              <span className="absolute inset-0 flex items-center justify-center"><Play className="w-6 h-6 text-white fill-current drop-shadow"/></span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{v.genieMode === 'spin360' ? '360 video' : v.promptText ? `“${v.promptText}”` : 'Video message'}</p>
              <p className="text-xs text-gray-500">{when(v.createdAt)}{v.durationMs ? ` · ${length(v.durationMs)}` : ''}</p>
              {v.propId && <p className="text-xs text-gray-500">Prop: {v.propName ?? 'a prop no longer in the library'} · Original kept on the booth iPad</p>}
            </div>
            {v.genieMode === 'spin360' && <Badge variant="info">360</Badge>}
            {v.hiddenAt && <Badge variant="default">Hidden</Badge>}
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={busy === v.id} onClick={() => setHidden(v, !v.hiddenAt)}>
                {v.hiddenAt ? <><Eye className="w-4 h-4 mr-1"/>Show</> : <><EyeOff className="w-4 h-4 mr-1"/>Hide</>}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C] hover:bg-red-50" disabled={busy === v.id} onClick={() => remove(v)} aria-label="Delete the video">
                <Trash2 className="w-4 h-4"/>
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">Hidden videos stay out of the public gallery and the guest&apos;s own page. Videos follow the gallery&apos;s expiry and deletion dates, like photos.</p>

      {playing && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setPlaying(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setPlaying(null)} aria-label="Close"><X className="w-6 h-6"/></button>
          <video src={playing.url} poster={playing.thumbnailUrl ?? undefined} controls autoPlay playsInline className="max-h-[80vh] max-w-[90vw] rounded-lg" onClick={e => e.stopPropagation()}/>
          {playing.promptText && <p className="mt-3 text-white/80 text-sm">“{playing.promptText}”</p>}
        </div>
      )}
    </div>
  );
}
