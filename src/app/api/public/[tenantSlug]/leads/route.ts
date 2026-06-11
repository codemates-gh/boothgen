export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function POST(req: NextRequest, { params }: { params: { tenantSlug: string } }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, include: { apiKeys: { where: { isActive: true }, take: 1 } } });
  if (!tenant || tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
  }
  const body = await req.json();
  const { firstName, lastName, email, phone, eventDate, eventType, guestCount, message, referrerUrl } = body;
  if (!firstName || !lastName || !email || !eventDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: cors() });
  }
  const apiKeyId = tenant.apiKeys[0]?.id ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const recent = await prisma.leadSubmission.findFirst({ where: { tenantId: tenant.id, email: email.toLowerCase(), createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
  if (recent) {
    return NextResponse.json({ success: true, message: 'Inquiry received.' }, { status: 200, headers: cors() });
  }
  const lead = await prisma.leadSubmission.create({
    data: {
      tenantId: tenant.id,
      apiKeyId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || null,
      eventDate: new Date(eventDate),
      eventType: eventType || null,
      guestCount: guestCount ? parseInt(guestCount) : null,
      message: message || null,
      referrerUrl: referrerUrl || null,
      ipAddress: ip,
    },
  });
  try {
    await prisma.client.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase().trim() } },
      update: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone || null },
      create: { tenantId: tenant.id, firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase().trim(), phone: phone || null },
    });
  } catch {}
  return NextResponse.json({ success: true, message: "Inquiry received. We'll be in touch shortly." }, { status: 201, headers: cors() });
}
