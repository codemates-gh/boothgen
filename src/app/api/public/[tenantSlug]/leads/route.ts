export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

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
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenantSlug },
    include: {
      apiKeys: { where: { isActive: true }, take: 1 },
      branding: true,
      memberships: { where: { role: 'HOST_ADMIN', status: 'ACTIVE' }, include: { user: { select: { email: true } } } },
    },
  });
  if (!tenant || tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
  }
  const body = await req.json();
  const { firstName, lastName, email, phone, company, eventDate, eventType, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    guestCount, message, referrerUrl } = body;
  if (!firstName || !lastName || !email || !eventDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: cors() });
  }

  // Server-side blackout date check
  if (eventDate) {
    const dateObj = new Date(eventDate);
    const blackout = await prisma.blackoutDate.findFirst({
      where: { tenantId: tenant.id, date: dateObj },
    });
    if (blackout) {
      return NextResponse.json(
        { error: "Sorry, we're not available on this date. Please choose another date." },
        { status: 409, headers: cors() }
      );
    }
  }

  const apiKeyId = tenant.apiKeys[0]?.id ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const recent = await prisma.leadSubmission.findFirst({ where: { tenantId: tenant.id, email: email.toLowerCase(), createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
  if (recent) {
    return NextResponse.json({ success: true, message: 'Inquiry received.' }, { status: 200, headers: cors() });
  }
  await prisma.leadSubmission.create({
    data: {
      tenantId: tenant.id,
      apiKeyId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || null,
      company: company || null,
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
      update: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone || null, company: company || null },
      create: { tenantId: tenant.id, firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase().trim(), phone: phone || null, company: company || null },
    });
  } catch {}

  const companyName = tenant.branding?.companyName || tenant.name || 'Your Company';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromAddress = companyName ? `${companyName} <${emailFrom}>` : emailFrom;
  const replyTo = tenant.branding?.replyToEmail ?? undefined;

  // Notify host admins of new lead
  try {
    const eventDateStr = new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    for (const m of tenant.memberships) {
      if (!m.user?.email) continue;
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
</div>`,
        replyTo
      );
    }
  } catch {}

  // Fire LEAD_CREATED automation rules — send template email to the client
  try {
    const rules = await prisma.automationRule.findMany({
      where: { tenantId: tenant.id, trigger: 'LEAD_CREATED', isActive: true, actionType: 'EMAIL' },
      include: { emailTemplate: true },
    });

    if (rules.length > 0) {
      // Build a merge context from lead data + branding (no event record yet)
      const pseudoStartTime = startTime ? new Date(`1970-01-01T${startTime}`) : null;
      const pseudoEndTime = endTime ? new Date(`1970-01-01T${endTime}`) : null;
      const ctx = buildCtx({
        client: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase().trim(), phone: phone || null },
        event: {
          title: eventType || 'Your inquiry',
          eventDate: new Date(eventDate),
          startTime: pseudoStartTime,
          endTime: pseudoEndTime,
          venueName: venueName || null,
          venueAddress: venueAddress || null,
          venueCity: venueCity || null,
          venueState: venueState || null,
          venuePostalCode: venuePostalCode || null,
          guestCount: guestCount ? parseInt(guestCount) : null,
        },
        branding: tenant.branding ?? {},
        appUrl,
      });

      for (const rule of rules) {
        if (!rule.emailTemplate) continue;
        const subject = parseMergeTags(rule.emailTemplate.subject, ctx);
        const bodyHtml = parseMergeTags(rule.emailTemplate.bodyHtml, ctx);
        const result = await sendEmail(email.toLowerCase().trim(), subject, bodyHtml, replyTo, fromAddress);
        if (!result.success) {
          console.error('[LEAD_AUTOMATION] email failed for', email, result.error);
        } else {
          console.log('[LEAD_AUTOMATION] sent to', email, 'rule:', rule.name, 'id:', result.id);
        }
      }
    }
  } catch (err) {
    console.error('[LEAD_AUTOMATION]', err);
  }

  return NextResponse.json({ success: true, message: "Inquiry received. We'll be in touch shortly." }, { status: 201, headers: cors() });
}
