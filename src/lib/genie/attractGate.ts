// Gate on attract-screen videos, checked in the editor before uploading and again on the server after probing:
// only the first 30 s are used, so a much longer or larger video is a wasted upload and a slow encode.
// No server imports: the editor (a client component) uses this too.

export const ATTRACT_VIDEO_SOURCE_MAX_SECONDS = 60;
export const ATTRACT_SOURCE_MAX_SIDE = 4096;

// Why a video is too big to take, or null
export function attractVideoGate(durationMs: number | null, width: number, height: number): string | null {
  if (durationMs !== null && durationMs > ATTRACT_VIDEO_SOURCE_MAX_SECONDS * 1000 + 500) {
    return `That video is ${Math.round(durationMs / 1000)} seconds long. Trim it to under a minute (a 10–20 second loop looks best) and upload it again.`;
  }
  if (Math.max(width, height) > ATTRACT_SOURCE_MAX_SIDE) {
    return `That video is ${width}×${height}. Export it at 4K or smaller (1080p is plenty for the iPad) and upload it again.`;
  }
  return null;
}
