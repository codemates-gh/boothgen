export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { uploadToR2 } from '@/lib/storage/r2';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('logo') as File | null;
    if (!file || !file.size) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const key = `logos/${session.tenantId}/logo.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(key, buffer, file.type || 'image/png');

    await prisma.tenantBranding.upsert({
      where: { tenantId: session.tenantId },
      update: { logoUrl: url },
      create: { tenantId: session.tenantId, logoUrl: url },
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[LOGO_UPLOAD]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
