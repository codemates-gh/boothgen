export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendContractLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { expiryDays = 14 } = await req.json().catch(() => ({}));
  const expiresAt = new Date(Date.now() + expiryDays * 86400000);
  await prisma.contract.update({ where: { id: contract.id }, data: { status: 'SENT_TO_CLIENT', expiresAt } });
  const portalToken = (contract.event as any)?.portalToken ?? '';
  await sendContractLink({ to: contract.client.email, firstName: contract.client.firstName, companyName: contract.tenant.branding?.companyName ?? contract.tenant.name, contractTitle: contract.title, portalUrl: APP + '/portal/' + portalToken, expiresAt });
  return NextResponse.json({ success: true, expiresAt });
}
