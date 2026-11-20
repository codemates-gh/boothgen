import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, listR2Objects } from '@/lib/storage/r2';
import { eventClosesAt } from './bundle';
import { boomerangDesign } from './boomerang';
import { boomerangDesignWithText, eventTextForBundle, type OverlayFor } from './eventText';
import { textOverlayKey, textOverlayR2Key } from './textRender';

// Files an event leaves behind that nothing needs once it's over (G, 2026-11-20), deleted nightly whether or not the
// event ever took place:
// - Test Templates pictures (genie-tests/<tenant>/<event>/...): once the event is Past, or deleted.
// - Template text pictures (genie-templates/<tenant>/text/...; the event's words drawn onto a template's overlay, one
//   per template and wording): 7 days after the event is Past, unless an event that isn't (or a newer one with the
//   same words) still uses it. A duplicate that needs one again gets it redrawn when its bundle is built.
const DAY_MS = 86400_000;
const TEXT_KEEP_AFTER_PAST_MS = 7 * DAY_MS;
// Just drawn: an iPad may not have downloaded it yet, even if the words have since changed
const RECENT_MS = 2 * DAY_MS;

export async function sweepTestShareImages(now = new Date()): Promise<number> {
  const objects = await listR2Objects('genie-tests/');
  const eventIds = Array.from(new Set(objects.map(o => o.key.split('/')[2]).filter(Boolean)));
  const events = await prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, eventDate: true, genieSettings: { select: { timeZone: true } } } });
  const open = new Set(events.filter(e => eventClosesAt(e, e.genieSettings?.timeZone ?? 'UTC') > now).map(e => e.id));
  let deleted = 0;
  for (const o of objects) {
    if (open.has(o.key.split('/')[2])) continue;
    try { await deleteFromR2(o.key); deleted++; } catch (err) { console.error('[genie] test picture cleanup failed', o.key, err); }
  }
  return deleted;
}

// The text picture files an account's events still need: every event not yet 7 days past its window
async function textKeysInUse(tenantId: string, now: Date): Promise<Set<string>> {
  const keep = new Set<string>();
  const events = await prisma.event.findMany({
    where: { tenantId, eventDate: { gte: new Date(now.getTime() - 4 * DAY_MS - TEXT_KEEP_AFTER_PAST_MS) }, genieSettings: { isNot: null } },
    select: { id: true, eventDate: true, genieSettings: true, genieTemplates: true },
  });
  const note: OverlayFor = async (t, layout, values, look) => {
    const key = textOverlayKey(layout, values, look);
    if (key) keep.add(textOverlayR2Key(t, key));
    return null;
  };
  for (const e of events) {
    const s = e.genieSettings!;
    if (eventClosesAt(e, s.timeZone).getTime() + TEXT_KEEP_AFTER_PAST_MS <= now.getTime()) continue;
    await eventTextForBundle(tenantId, e.id, e.genieTemplates, s.templateText, note);
    await boomerangDesignWithText(tenantId, e.id, s.boomerang, await boomerangDesign(s.boomerang, tenantId), s.templateText, note);
  }
  return keep;
}

export async function sweepTemplateTextImages(now = new Date()): Promise<number> {
  const tenants = await prisma.tenant.findMany({ where: { genieEnabled: true }, select: { id: true } });
  let deleted = 0;
  for (const { id } of tenants) {
    const objects = (await listR2Objects(`genie-templates/${id}/text/`)).filter(o => now.getTime() - o.lastModified.getTime() > RECENT_MS);
    if (objects.length === 0) continue;
    const keep = await textKeysInUse(id, now);
    for (const o of objects) {
      if (keep.has(o.key)) continue;
      try { await deleteFromR2(o.key); deleted++; } catch (err) { console.error('[genie] text picture cleanup failed', o.key, err); }
    }
  }
  return deleted;
}
