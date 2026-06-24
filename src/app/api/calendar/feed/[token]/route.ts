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

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { calendarToken: params.token },
    include: {
      branding: { select: { companyName: true } },
      events: {
        include: { client: true },
        orderBy: { eventDate: 'asc' },
      },
    },
  });

  if (!tenant) return new NextResponse('Not found', { status: 404 });

  const companyName = tenant.branding?.companyName ?? tenant.name;
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
    // End date = next day for all-day events
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
    lines.push(foldLine(`DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`));
    lines.push('END:VEVENT');
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
