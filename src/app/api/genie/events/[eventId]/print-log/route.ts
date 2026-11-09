export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice, findDeviceEvent, genieError, isUniqueViolation, readJson } from '@/lib/genie/auth';
import { PrintLogEntry, firstIssue } from '@/lib/genie/schemas';

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = PrintLogEntry.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const body = parsed.data;

  const repeat = async () => {
    const report = await prisma.geniePrintReport.findUnique({ where: { clientId: body.id } });
    if (!report) return null;
    if (report.tenantId !== auth.tenant.id || report.eventId !== event.id) return genieError(422, 'report_conflict', 'This report id belongs to another event');
    return NextResponse.json({ printCount: report.printCountAfter });
  };
  const existing = await repeat();
  if (existing) return existing;

  try {
    const printCount = await prisma.$transaction(async tx => {
      const defaultProfile = await tx.consumableProfile.findFirst({
        where: { tenantId: auth.tenant.id, isDefault: true, isActive: true },
        select: { id: true },
      });
      const log = await tx.eventPrintLog.upsert({
        where: { eventId: event.id },
        create: { tenantId: auth.tenant.id, eventId: event.id, printCount: body.prints, source: 'genie', consumableProfileId: defaultProfile?.id ?? null },
        update: { printCount: { increment: body.prints }, source: 'genie' },
      });
      await tx.geniePrintReport.create({
        data: {
          tenantId: auth.tenant.id, eventId: event.id, deviceId: auth.device.id, clientId: body.id, prints: body.prints,
          periodStart: new Date(body.periodStart), periodEnd: new Date(body.periodEnd), printCountAfter: log.printCount,
        },
      });
      return log.printCount;
    });
    return NextResponse.json({ printCount });
  } catch (err) {
    // A concurrent repeat of the same report rolled this transaction back
    if (!isUniqueViolation(err)) throw err;
    const raced = await repeat();
    if (raced) return raced;
    throw err;
  }
}
