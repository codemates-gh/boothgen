export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { parseBuffer } from '@/lib/import/parse';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
    return NextResponse.json({ error: 'Only .csv, .xlsx, and .xls files are supported' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = parseBuffer(buffer, file.name);

  if (result.totalRows === 0) {
    return NextResponse.json({ error: 'The file appears to be empty or has no data rows' }, { status: 400 });
  }

  // Check existing clients so preview can show "X already in BoothGen"
  const validEmails = result.rows.filter(r => !r.error).map(r => r.email);
  const existingClients = await prisma.client.findMany({
    where: { tenantId, email: { in: validEmails } },
    select: { email: true },
  });
  const existingEmails = new Set(existingClients.map(c => c.email));

  // Compute preview stats
  const now = new Date();
  const valid   = result.rows.filter(r => !r.error);
  const skipped = result.rows.filter(r => r.error);
  const uniqueEmails = [...new Set(valid.map(r => r.email))];
  const newClients      = uniqueEmails.filter(e => !existingEmails.has(e)).length;
  const returningClients = uniqueEmails.filter(e => existingEmails.has(e)).length;
  const withEvents  = valid.filter(r => r.eventDateIso).length;
  const pastEvents  = valid.filter(r => r.eventDateIso && new Date(r.eventDateIso) < now).length;
  const futureEvents = withEvents - pastEvents;

  return NextResponse.json({
    ...result,
    preview: result.rows.slice(0, 5),
    stats: {
      totalRows:       result.totalRows,
      validRows:       valid.length,
      skippedRows:     skipped.length,
      newClients,
      returningClients,
      withEvents,
      pastEvents,
      futureEvents,
    },
  });
}
