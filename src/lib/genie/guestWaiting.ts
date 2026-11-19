// Guest page waiting rules, shared by the session page, the live gallery and their APIs (no server imports)

// How long to wait before checking again, by time spent waiting: quick at first, then slower
export function pollDelayMs(waitingMs: number): number {
  if (waitingMs < 2 * 60_000) return 5_000;
  if (waitingMs < 10 * 60_000) return 15_000;
  return 60_000;
}

// After this long without a request from the booth's iPad, the booth counts as offline. Genie sends a heartbeat
// (GET /api/genie/config) every 60 s while an event is loaded; lastSeenAt is written at most once a minute, so
// 3 minutes covers the heartbeat, the write interval and one missed beat.
export const BOOTH_OFFLINE_AFTER_MS = 3 * 60_000;

// "Booth offline" only when nothing has arrived yet and we know which iPad(s) to look at: a guest with
// photos isn't waiting on the booth, and with no known iPad we can't tell.
export function isBoothOffline(o: { photoCount: number; lastSeenAt: Date | null | undefined; now?: Date }): boolean {
  if (o.photoCount > 0 || o.lastSeenAt === undefined) return false;
  if (o.lastSeenAt === null) return true;
  return (o.now ?? new Date()).getTime() - o.lastSeenAt.getTime() > BOOTH_OFFLINE_AFTER_MS;
}

// Stop saying "more on the way" if nothing new has arrived for this long (a shot may never come)
export const MORE_PHOTOS_GRACE_MS = 30 * 60_000;

// Shots a session takes: each template sets it (one per photo frame, by the frames' shot numbers). With several
// templates the fewest wins, so a page never waits for shots a template doesn't take; no templates: the event's count.
export function expectedShots(layouts: unknown[], fallback: number): number {
  const counts = layouts.map(l => {
    const slots = (l as { slots?: { shotIndex?: unknown }[] } | null)?.slots;
    const idx = Array.isArray(slots) ? slots.map(s => (typeof s?.shotIndex === 'number' ? s.shotIndex : -1)).filter(i => i >= 0) : [];
    return idx.length ? Math.max(...idx) + 1 : 0;
  }).filter(n => n > 0);
  return counts.length ? Math.min(...counts) : fallback;
}

// The gallery copy shows first; more is expected until every shot is in
export function morePhotosPending(o: { hasGallery: boolean; shots: number; expectedShots: number; lastPhotoAt: Date | null; now?: Date }): boolean {
  if (!o.lastPhotoAt) return false;
  if (o.hasGallery && o.shots >= o.expectedShots) return false;
  return (o.now ?? new Date()).getTime() - o.lastPhotoAt.getTime() < MORE_PHOTOS_GRACE_MS;
}

// Muted "ask the host" line only after a long wait on the page
export const LONG_WAIT_MS = 30 * 60_000;
