export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { libraryWhere } from '@/lib/genie/library';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { GENIE_SETTINGS_DEFAULTS, designApprovalPending, effectiveLockedAt, eventLocksAt, isValidTimeZone } from '@/lib/genie/bundle';
import { SettingsPatch, findAdminEvent, lockedError, providerWarnings, settingsUpdateData, settingsView, templateView } from '@/lib/genie/eventAdmin';
import { galleryRetentionDates, getGalleryRetention } from '@/lib/gallery/retention';

// Everything the event's Genie dashboard shows
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [templates, messaging, retention, pending] = await Promise.all([
    prisma.eventGenieTemplate.findMany({ where: { eventId: event.id, tenantId: auth.tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.genieMessagingConfig.findUnique({ where: { tenantId: auth.tenantId } }),
    getGalleryRetention(),
    designApprovalPending([event.id]),
  ]);
  const libIds = Array.from(new Set(templates.map(t => t.libraryTemplateId).filter((id): id is string => !!id)));
  const withAlternate = new Set((await prisma.boothDesignTemplate.findMany({
    where: { id: { in: libIds }, ...libraryWhere(auth.tenantId), alternateLayout: { not: Prisma.AnyNull } }, select: { id: true },
  })).map(t => t.id));
  const s = event.genieSettings;
  const photos = galleryRetentionDates(event.eventDate, retention);
  return NextResponse.json({
    event: { id: event.id, title: event.title, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime },
    settings: s ? settingsView(s) : null,
    lockedAt: s ? effectiveLockedAt(event, s) : null,
    locksAt: eventLocksAt(event, s?.timeZone ?? 'America/New_York'),
    templates: templates.map(t => ({ ...templateView(t), alternateAvailable: !!t.libraryTemplateId && withAlternate.has(t.libraryTemplateId) })),
    providerWarnings: s ? providerWarnings(messaging, s) : [],
    photosHiddenAt: photos.hiddenAt,
    photosDeletedAt: photos.deletedAt,
    designApprovalPending: pending.has(event.id),
  });
}

const SetUp = z.object({ timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone') }).strict();

// Turns Genie on for the event with default settings
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = SetUp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (event.genieSettings) return NextResponse.json(settingsView(event.genieSettings));
  try {
    const s = await prisma.eventGenieSettings.create({ data: { tenantId: auth.tenantId, eventId: event.id, timeZone: parsed.data.timeZone, ...GENIE_SETTINGS_DEFAULTS } });
    return NextResponse.json(settingsView(s), { status: 201 });
  } catch (err) {
    if ((err as any)?.code !== 'P2002') throw err;
    return NextResponse.json(settingsView(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = SettingsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: i?.path.join('.') }, { status: 400 });
  }
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const s = event.genieSettings;
  if (!s) return NextResponse.json({ error: 'Set up Genie for this event first', code: 'not_configured' }, { status: 409 });
  if (effectiveLockedAt(event, s)) return lockedError();

  const result = settingsUpdateData(parsed.data, s);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const saved = await prisma.eventGenieSettings.update({ where: { id: s.id }, data: result.data });
  return NextResponse.json(settingsView(saved));
}
