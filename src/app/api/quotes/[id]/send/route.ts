export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true },
  });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.quote.update({ where: { id: params.id }, data: { status: 'SENT', sentAt: new Date() } });
  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || '') + '/portal/' + q.event.portalToken + '?tab=quote';
  // Send email via Resend
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@boothgen.vercel.app',
      to: q.client.email,
      subject: 'Your Quote from ' + (q.event.title || 'Us'),
      html: '<p>Hi ' + q.client.firstName + ',</p><p>Your quote is ready to review. Please click the link below to view and accept your quote:</p><p><a href="' + portalUrl + '" style="background:#F97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review Your Quote</a></p><p>Thank you!</p>',
    });
  } catch (e) { console.error('Email failed:', e); }
  return NextResponse.json(updated);
}
