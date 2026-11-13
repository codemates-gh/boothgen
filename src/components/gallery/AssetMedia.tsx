'use client';
import { Play } from 'lucide-react';
import { FadeInImg } from '@/components/genie/GuestWaiting';

// Gallery photos and Genie boomerang clips (MP4, with the poster as thumbnailUrl)
export type MediaAsset = { url: string; assetType?: string | null; mimeType?: string | null; thumbnailUrl?: string | null };

export const isVideo = (a: MediaAsset) => a.assetType === 'VIDEO' || !!a.mimeType?.startsWith('video/');

export function assetExt(a: MediaAsset): string {
  if (isVideo(a)) return 'mp4';
  return a.url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
}

// Grid tile: a clip shows its poster with a play badge (the clip itself plays when opened)
export function AssetThumb({ asset, className, alt = '', fade }: { asset: MediaAsset; className?: string; alt?: string; fade?: boolean }) {
  const Img = fade ? FadeInImg : 'img';
  if (!isVideo(asset)) return <Img src={asset.url} alt={alt} className={className}/>;
  return (
    <>
      {asset.thumbnailUrl
        ? <Img src={asset.thumbnailUrl} alt={alt} className={className}/>
        : <video src={asset.url} muted playsInline preload="metadata" className={className}/>}
      <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-[11px] font-medium pointer-events-none">
        <Play className="w-3 h-3 fill-current"/>Boomerang
      </span>
    </>
  );
}

// Full size: a clip plays inline on a loop, muted (so phones autoplay it)
export function AssetFull({ asset, className, onClick }: { asset: MediaAsset; className?: string; onClick?: (e: React.MouseEvent) => void }) {
  if (isVideo(asset)) {
    return <video key={asset.url} src={asset.url} poster={asset.thumbnailUrl ?? undefined} autoPlay muted loop playsInline className={className} onClick={onClick}/>;
  }
  return <img src={asset.url} alt="" className={className} onClick={onClick}/>;
}
