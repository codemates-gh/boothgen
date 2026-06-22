export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { uploadToR2 } from '@/lib/storage/r2';
import { inngest } from '@/lib/inngest/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only images and PDF files are supported' }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `templates/${session.tenantId}/${params.id}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const publicUrl = await uploadToR2(key, buffer, file.type);

  // Find next version number
  const latest = await prisma.templateDesign.findFirst({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;

  const design = await prisma.templateDesign.create({
    data: { tenantId: session.tenantId, eventId: params.id, fileUrl: publicUrl, filename: file.name, version, status: 'PENDING_APPROVAL' },
  });

  // Notify the client immediately — upload = ready for review
  inngest.send({ name: 'template-design/ready-for-review', data: { designId: design.id } }).catch(() => {});

  return NextResponse.json(design, { status: 201 });
}
