export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { clientTemplateView, clientTemplates, clientTemplatesWhere } from '@/lib/templates/clientLibrary';

export async function GET(_: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({
    where: { portalToken: params.portalToken },
    include: {
      tenant: {
        include: {
          branding: { select: { designBriefEnabled: true, customDesignEnabled: true } },
        },
      },
      designBrief: { include: { template: true } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const designBriefEnabled = event.tenant.branding?.designBriefEnabled ?? false;
  if (!designBriefEnabled) return NextResponse.json(null);

  // Brief + the layouts this operator offers (Standard they haven't hidden, plus their own offered templates)
  const templates = await clientTemplates(event.tenantId);
  const brief = event.designBrief ? { ...event.designBrief, template: event.designBrief.template ? clientTemplateView(event.designBrief.template) : null } : null;

  return NextResponse.json({
    brief,
    templates,
    customDesignEnabled: event.tenant.branding?.customDesignEnabled ?? false,
  });
}

export async function POST(req: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({
    where: { portalToken: params.portalToken },
    include: {
      client: true,
      tenant: { include: { branding: { select: { companyName: true, replyToEmail: true, designBriefEnabled: true } } } },
      designBrief: true,
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!event.tenant.branding?.designBriefEnabled) return NextResponse.json({ error: 'Design brief not enabled.' }, { status: 400 });

  const { templateId, selectedColorVariantId, selectedFontPairingId, textValues, themeInput, themeDirections, selectedDirectionIndex, isCustomDesign, notes } = await req.json();

  // The layout must be one this operator offers
  if (templateId && !(await prisma.boothDesignTemplate.findFirst({ where: { id: templateId, ...(await clientTemplatesWhere(event.tenantId)) }, select: { id: true } }))) {
    return NextResponse.json({ error: 'That layout is no longer available. Pick another one.' }, { status: 400 });
  }

  // Upsert brief
  const existingBrief = event.designBrief;
  if (existingBrief && (existingBrief.status === 'SUBMITTED' || existingBrief.status === 'IN_DESIGN' || existingBrief.status === 'APPROVED')) {
    return NextResponse.json({ error: 'Design preferences already submitted.' }, { status: 400 });
  }

  const data = {
    tenantId: event.tenantId,
    eventId: event.id,
    templateId: templateId || null,
    selectedColorVariantId: selectedColorVariantId || null,
    selectedFontPairingId: selectedFontPairingId || null,
    textValues: textValues ?? {},
    themeInput: themeInput || null,
    themeDirections: themeDirections ?? null,
    selectedDirectionIndex: selectedDirectionIndex ?? null,
    isCustomDesign: isCustomDesign ?? false,
    notes: notes || null,
    status: 'SUBMITTED' as const,
    submittedAt: new Date(),
  };

  const brief = existingBrief
    ? await prisma.eventDesignBrief.update({ where: { id: existingBrief.id }, data, include: { template: true } })
    : await prisma.eventDesignBrief.create({ data, include: { template: true } });

  // Notify operator
  const replyTo = event.tenant.branding?.replyToEmail;
  if (replyTo) {
    const clientName = `${event.client.firstName} ${event.client.lastName}`;
    await sendEmail(
      replyTo,
      `Design brief submitted — ${event.title}`,
      `<p><strong>${clientName}</strong> has submitted their photo booth design preferences for <strong>${event.title}</strong>.</p><p>Log in to view the brief and start designing.</p>`,
    ).catch(() => {});
  }

  return NextResponse.json(brief);
}
