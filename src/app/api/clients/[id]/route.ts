import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const events = await prisma.event.findMany({ where: { clientId: client.id, tenantId: session.tenantId }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json({ client, events });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.client.update({ where: { id: params.id }, data: { firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone || null, company: body.company || null, addressLine1: body.addressLine1 || null, city: body.city || null, state: body.state || null, postalCode: body.postalCode || null, notes: body.notes || null } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const eventCount = await prisma.event.count({ where: { clientId: client.id } });
  if (eventCount > 0) return NextResponse.json({ error: 'Cannot delete client with ' + eventCount + ' event(s). Delete the events first.' }, { status: 400 });
  await prisma.client.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
