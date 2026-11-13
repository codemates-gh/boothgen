export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { PROP_MAX_BYTES, storePropImage } from '@/lib/genie/props';

// A prop PNG (multipart field "file"; "scope" = mine | standard). Checked (PNG, transparent, 2 MB, 4096 px) and
// stored content-addressed; the prop itself is saved separately with the returned URL.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const scope = form?.get('scope') === 'standard' ? 'standard' : 'mine';
  if (scope === 'standard') {
    if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Only Booth Genius can change Standard props' }, { status: 403 });
  } else {
    if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { genieEnabled: true } });
    if (!tenant?.genieEnabled) return NextResponse.json({ error: 'Genie is not enabled for this account', code: 'genie_not_enabled' }, { status: 403 });
  }
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Choose a PNG to upload.' }, { status: 400 });
  if (file.size > PROP_MAX_BYTES) return NextResponse.json({ error: 'Props must be 2 MB or smaller. Export the PNG smaller (2048 px on the long side is plenty).' }, { status: 422 });
  const r = await storePropImage(Buffer.from(await file.arrayBuffer()), scope, scope === 'standard' ? null : session!.tenantId!);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json(r);
}
