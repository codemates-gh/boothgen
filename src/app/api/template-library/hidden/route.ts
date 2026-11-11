export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth/config';
import { setStandardHidden } from '@/lib/templates/clientLibrary';

const Body = z.object({ templateId: z.string().min(1), hidden: z.boolean() }).strict();

// An operator hides (or shows again) a Standard layout: it leaves their Standard templates and their clients' picker
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await setStandardHidden(session.tenantId, parsed.data.templateId, parsed.data.hidden);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, hidden: parsed.data.hidden });
}
