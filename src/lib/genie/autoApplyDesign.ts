import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { applyArtwork, latestApprovedDesign, loadDesignArtwork } from './approvedDesign';
import { findAdminEvent, isLocked } from './eventAdmin';
import { briefLibraryTemplate, copyToEvent } from './library';
import type { StoredLayout } from './schemas';

export type AutoApplyResult =
  | { applied: true; templateId: string; appliedAs: 'background' | 'overlay'; warning?: string }
  | { applied: false; reason: 'no_genie' | 'not_set_up' | 'locked' | 'no_design' | 'no_brief_layout' | 'artwork'; error?: string };

// Once the client approves a design, it goes on the layout they picked in their design brief, in the event's Genie
// templates (added first if it isn't there yet). Skipped when the account has no Genie, Genie isn't set up for the event
// yet (setup does it then), the event has started, or the file can't be used (the operator can still place it by hand).
export async function applyApprovedDesignToGenie(tenantId: string, eventId: string): Promise<AutoApplyResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { genieEnabled: true } });
  if (!tenant?.genieEnabled) return { applied: false, reason: 'no_genie' };
  const event = await findAdminEvent(tenantId, eventId);
  if (!event?.genieSettings) return { applied: false, reason: 'not_set_up' };
  if (isLocked(event)) return { applied: false, reason: 'locked' };
  const design = await latestApprovedDesign(tenantId, eventId);
  if (!design) return { applied: false, reason: 'no_design' };
  const lib = await briefLibraryTemplate(tenantId, eventId);
  if (!lib) return { applied: false, reason: 'no_brief_layout' };

  let template = await prisma.eventGenieTemplate.findFirst({ where: { eventId, tenantId, libraryTemplateId: lib.id }, orderBy: { sortOrder: 'asc' } });
  if (template?.designId === design.id) {
    return { applied: true, templateId: template.id, appliedAs: (template.layout as { overlay?: unknown }).overlay ? 'overlay' : 'background' };
  }

  const art = await loadDesignArtwork(tenantId, design.fileUrl);
  if ('error' in art) return { applied: false, reason: 'artwork', error: art.error };
  // Check the artwork fits before adding anything to the event
  const fit = applyArtwork({ layout: lib.layout as unknown as StoredLayout, alternateLayout: lib.alternateLayout as unknown as StoredLayout | null }, art);
  if ('error' in fit) return { applied: false, reason: 'artwork', error: fit.error };

  if (!template) {
    const r = await copyToEvent(tenantId, eventId, lib, !!lib.alternateLayout);
    if ('error' in r) return { applied: false, reason: 'artwork', error: r.error };
    template = r.template;
    // The client's layout goes first in the guest picker
    const first = await prisma.eventGenieTemplate.findFirst({ where: { eventId }, orderBy: { sortOrder: 'asc' }, select: { sortOrder: true } });
    if (first && first.sortOrder < template.sortOrder) {
      template = await prisma.eventGenieTemplate.update({ where: { id: template.id }, data: { sortOrder: first.sortOrder - 1 } });
    }
  }

  const applied = applyArtwork({ layout: template.layout as unknown as StoredLayout, alternateLayout: template.alternateLayout as unknown as StoredLayout | null }, art);
  if ('error' in applied) return { applied: false, reason: 'artwork', error: applied.error };
  await prisma.eventGenieTemplate.update({
    where: { id: template.id },
    data: { [applied.which]: applied.updated, designId: design.id, thumbnail: Prisma.DbNull, version: { increment: 1 } },
  });
  return { applied: true, templateId: template.id, appliedAs: applied.as, warning: applied.warning };
}
