export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { ParsedRow, combineDateTime } from '@/lib/import/parse';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows, filename }: { rows: ParsedRow[]; filename: string } = await req.json();
  if (!rows?.length) return NextResponse.json({ error: 'No rows provided' }, { status: 400 });

  const validRows = rows.filter(r => !r.error);
  if (!validRows.length) return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 });

  const now = new Date();
  const canUndoUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Create the batch record first
  const batch = await prisma.importBatch.create({
    data: { tenantId, filename: filename ?? null, totalRows: rows.length, canUndoUntil },
  });

  let clientsCreated = 0;
  let eventsCreated  = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  // Pre-fetch existing clients by email to avoid N+1 upserts
  const emailSet = [...new Set(validRows.map(r => r.email))];
  const existingClients = await prisma.client.findMany({
    where: { tenantId, email: { in: emailSet } },
    select: { id: true, email: true },
  });
  const clientMap = new Map(existingClients.map(c => [c.email, c.id]));

  for (const row of validRows) {
    try {
      // Create client if not exists — upsert so duplicate emails in the file are safe
      let clientId = clientMap.get(row.email);
      if (!clientId) {
        const created = await prisma.client.create({
          data: {
            tenantId,
            firstName:    row.firstName || 'Unknown',
            lastName:     row.lastName  || '',
            email:        row.email,
            phone:        row.phone     || null,
            company:      row.company   || null,
            notes:        null,
            importBatchId: batch.id,
          },
        });
        clientId = created.id;
        clientMap.set(row.email, clientId);
        clientsCreated++;
      }

      // Only create event if an event date was provided
      if (row.eventDateIso) {
        const eventDate = new Date(row.eventDateIso);
        const isPast    = eventDate < now;
        const startTime = combineDateTime(row.eventDateIso, row.startTimeStr);
        const endTime   = combineDateTime(row.eventDateIso, row.endTimeStr);

        await prisma.event.create({
          data: {
            tenantId,
            clientId,
            title:          row.eventTitle  || `${row.firstName} ${row.lastName} Event`.trim(),
            status:         isPast ? 'COMPLETED' : 'BOOKED',
            eventDate,
            startTime:      startTime ?? undefined,
            endTime:        endTime   ?? undefined,
            venueName:      row.venueName     || null,
            venueAddress:   row.venueAddress  || null,
            venueCity:      row.venueCity     || null,
            venueState:     row.venueState    || null,
            packageName:    row.packageName   || null,
            internalNotes:  row.internalNotes || null,
            guestCount:     row.guestCount    ?? null,
            importBatchId:  batch.id,
          },
        });
        eventsCreated++;
      }
    } catch (err: any) {
      errors.push({ row: row.rowIndex, reason: err?.message ?? 'Unknown error' });
    }
  }

  // Update batch with final counts
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      clientsCreated,
      eventsCreated,
      rowsSkipped: rows.filter(r => r.error).length + errors.length,
    },
  });

  return NextResponse.json({
    batchId:       batch.id,
    clientsCreated,
    eventsCreated,
    rowsSkipped:   rows.filter(r => r.error).length,
    runtimeErrors: errors,
    canUndoUntil:  canUndoUntil.toISOString(),
  });
}
