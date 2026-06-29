export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { format } from 'date-fns';

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) { chunks.push(' ' + line.slice(i, i + 74)); i += 74; }
  return chunks.join('\r\n');
}

function icsDate(d: Date): string {
  return format(d, 'yyyyMMdd');
}

const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { calendarToken: params.token },
    include: {
      branding: { select: { companyName: true } },
      events: {
        include: {
          client: true,
          templateDesigns: {
            where: { status: 'APPROVED' },
            take: 1,
            select: { id: true },
          },
          invoices: {
            include: {
              PaymentMilestone: {
                where: { status: { notIn: ['PAID', 'REFUNDED'] } },
                orderBy: { dueDate: 'asc' },
              },
            },
          },
        },
        orderBy: { eventDate: 'asc' },
      },
    },
  });

  if (!tenant) return new NextResponse('Not found', { status: 404 });

  const companyName = tenant.branding?.companyName ?? tenant.name;
  const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Booth Genius//${esc(companyName)}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(companyName)} Events`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const ev of tenant.events) {
    if (ev.status === 'CANCELLED') continue;
    const dtStart = icsDate(ev.eventDate);
    const nextDay = new Date(ev.eventDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const dtEnd = icsDate(nextDay);

    const clientName = `${ev.client.firstName} ${ev.client.lastName}`;
    const summary = `${esc(clientName)} — ${esc(ev.title)}`;
    const descParts = [
      `Client: ${clientName} (${ev.client.email})`,
      ev.venueName ? `Venue: ${ev.venueName}` : null,
      ev.venueCity ? `Location: ${[ev.venueCity, ev.venueState].filter(Boolean).join(', ')}` : null,
      `Status: ${ev.status}`,
    ].filter(Boolean) as string[];

    const status = ev.status === 'BOOKED' || ev.status === 'IN_PROGRESS' ? 'CONFIRMED' : 'TENTATIVE';

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:event-${ev.id}@boothgen.com`));
    lines.push(foldLine(`DTSTART;VALUE=DATE:${dtStart}`));
    lines.push(foldLine(`DTEND;VALUE=DATE:${dtEnd}`));
    lines.push(foldLine(`SUMMARY:${summary}`));
    lines.push(foldLine(`DESCRIPTION:${esc(descParts.join('\\n'))}`));
    if (ev.venueName) lines.push(foldLine(`LOCATION:${esc([ev.venueName, ev.venueAddress, ev.venueCity, ev.venueState].filter(Boolean).join(', '))}`));
    lines.push(`STATUS:${status}`);
    lines.push(foldLine(`DTSTAMP:${dtstamp}`));
    lines.push('END:VEVENT');

    // Design approval deadline — only for BOOKED/IN_PROGRESS events with no approved design
    const isBookedOrActive = ev.status === 'BOOKED' || ev.status === 'IN_PROGRESS';
    const hasApprovedDesign = ev.templateDesigns.length > 0;
    if (isBookedOrActive && !hasApprovedDesign) {
      // Show the deadline as 5 days before the event (or today if within 5 days)
      const fiveDaysBefore = new Date(ev.eventDate);
      fiveDaysBefore.setDate(fiveDaysBefore.getDate() - 5);
      const deadlineDate = fiveDaysBefore < new Date() ? new Date() : fiveDaysBefore;
      const ddStart = icsDate(deadlineDate);
      const ddNext = new Date(deadlineDate);
      ddNext.setDate(ddNext.getDate() + 1);
      const clientName = `${ev.client.firstName} ${ev.client.lastName}`;
      const daysUntil = Math.max(0, Math.floor((new Date(ev.eventDate).getTime() - Date.now()) / 86400_000));
      const urgencyPrefix = daysUntil <= 2 ? '⚠️ URGENT — ' : '🎨 ';

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:design-deadline-${ev.id}@boothgen.com`));
      lines.push(foldLine(`DTSTART;VALUE=DATE:${ddStart}`));
      lines.push(foldLine(`DTEND;VALUE=DATE:${icsDate(ddNext)}`));
      lines.push(foldLine(`SUMMARY:${urgencyPrefix}Design approval needed: ${esc(clientName)} — ${esc(ev.title)}`));
      lines.push(foldLine(`DESCRIPTION:${esc(`No approved design on file.\nEvent: ${ev.title}\nClient: ${clientName}\nEvent date: ${new Date(ev.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\nApproval needed before the event.`)}`));
      lines.push(`STATUS:${daysUntil <= 2 ? 'TENTATIVE' : 'CONFIRMED'}`);
      lines.push(foldLine(`DTSTAMP:${dtstamp}`));
      lines.push('END:VEVENT');
    }

    // Add a VEVENT for each unpaid payment milestone on this event
    for (const invoice of ev.invoices) {
      if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') continue;
      for (const ms of invoice.PaymentMilestone) {
        const msDue = new Date(ms.dueDate);
        const msStart = icsDate(msDue);
        const msNext = new Date(msDue);
        msNext.setDate(msNext.getDate() + 1);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const isOverdue = msDue < today;

        const msLabel = isOverdue ? `⚠️ OVERDUE` : `💳 Payment Due`;
        const msSummary = `${msLabel}: ${esc(clientName)} — ${esc(ms.label)} (${esc(fmt(ms.amountCents))})`;
        const msDesc = [
          `Invoice: ${invoice.invoiceNumber}`,
          `Milestone: ${ms.label}`,
          `Amount: ${fmt(ms.amountCents)}`,
          isOverdue ? `Status: OVERDUE` : `Status: Due ${msDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        ].join('\\n');

        lines.push('BEGIN:VEVENT');
        lines.push(foldLine(`UID:milestone-${ms.id}@boothgen.com`));
        lines.push(foldLine(`DTSTART;VALUE=DATE:${msStart}`));
        lines.push(foldLine(`DTEND;VALUE=DATE:${icsDate(msNext)}`));
        lines.push(foldLine(`SUMMARY:${msSummary}`));
        lines.push(foldLine(`DESCRIPTION:${esc(msDesc)}`));
        lines.push(`STATUS:${isOverdue ? 'TENTATIVE' : 'CONFIRMED'}`);
        lines.push(foldLine(`DTSTAMP:${dtstamp}`));
        lines.push('END:VEVENT');
      }
    }
  }

  lines.push('END:VCALENDAR');

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tenant.slug}-events.ics"`,
      'Cache-Control': 'no-cache',
    },
  });
}
