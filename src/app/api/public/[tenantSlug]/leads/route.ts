export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

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
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, include: { apiKeys: { where: { isActive: true }, take: 1 }, branding: { select: { companyName: true } } } });
  if (!tenant || tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
  }
  const body = await req.json();
  const { firstName, lastName, email, phone, eventDate, eventType, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    guestCount, message, referrerUrl } = body;
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
      startTime: startTime || null,
      endTime: endTime || null,
      venueName: venueName || null,
      venueAddress: venueAddress || null,
      venueCity: venueCity || null,
      venueState: venueState || null,
      venuePostalCode: venuePostalCode || null,
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

  // Notify tenant owners
  try {
    const owners = await prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id, role: 'HOST_ADMIN', status: 'ACTIVE' },
      include: { user: { select: { email: true, name: true } } },
    });
    const companyName = tenant.branding?.companyName || tenant.name || 'Your Company';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
    const eventDateStr = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not specified';
    for (const m of owners) {
      await sendEmail(
        m.user.email,
        `New inquiry from ${firstName} ${lastName}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:20px;color:#111827">New Inquiry Received</h2>
<p>You have a new lead inquiry submitted through your ${companyName} lead capture form.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600">${firstName} ${lastName}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Email</td><td style="padding:8px 0;font-size:14px">${email}</td></tr>
  ${phone ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Phone</td><td style="padding:8px 0;font-size:14px">${phone}</td></tr>` : ''}
  <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Event Date</td><td style="padding:8px 0;font-size:14px">${eventDateStr}</td></tr>
  ${eventType ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Event Type</td><td style="padding:8px 0;font-size:14px">${eventType}</td></tr>` : ''}
  ${guestCount ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Guests</td><td style="padding:8px 0;font-size:14px">${guestCount}</td></tr>` : ''}
  ${message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top">Message</td><td style="padding:8px 0;font-size:14px">${message}</td></tr>` : ''}
</table>
<p style="margin:24px 0"><a href="${appUrl}/leads" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Inquiry</a></p>
<p style="color:#6b7280;font-size:12px;">Sent by Booth Genius</p>
</div>`
      );
    }
  } catch {}

  return NextResponse.json({ success: true, message: "Inquiry received. We'll be in touch shortly." }, { status: 201, headers: cors() });
}
