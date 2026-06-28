export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

// Use the full model for drafting/composition tasks
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const { tenantId } = session;

  const lead = await prisma.leadSubmission.findFirst({
    where: { id: params.id, tenantId },
    include: {
      messages: { orderBy: { sentAt: 'asc' }, take: 5, select: { direction: true, subject: true, bodyText: true } },
    },
  });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured.' }, { status: 503 });
  }

  const branding = await prisma.tenantBranding.findUnique({
    where: { tenantId },
    select: { companyName: true, replyToEmail: true },
  });
  const companyName = branding?.companyName ?? 'our company';

  const { tone = 'professional and warm' } = await req.json().catch(() => ({}));

  const eventDate = lead.eventDate
    ? lead.eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const contextLines = [
    `Client: ${lead.firstName} ${lead.lastName}`,
    `Email: ${lead.email}`,
    lead.eventDate ? `Event date: ${eventDate}` : null,
    lead.eventType ? `Event type: ${lead.eventType}` : null,
    lead.venueName ? `Venue: ${lead.venueName}${lead.venueCity ? `, ${lead.venueCity}` : ''}` : null,
    lead.guestCount ? `Expected guests: ${lead.guestCount}` : null,
    lead.message ? `Client's inquiry:\n${lead.message}` : null,
  ].filter(Boolean).join('\n');

  const prevMessages = lead.messages
    .slice(-3)
    .map(m => `[${m.direction === 'OUTBOUND' ? companyName : lead.firstName}]: ${m.bodyText ?? m.subject}`)
    .join('\n\n');

  const prompt = `You are writing a ${tone} email reply on behalf of ${companyName}, a photo booth rental company.

Lead context:
${contextLines}
${prevMessages ? `\nPrevious conversation:\n${prevMessages}` : ''}

Write a reply email that:
- Addresses ${lead.firstName} by first name
- Acknowledges their interest warmly
- Mentions relevant event details if available
- Proposes a clear next step (e.g., scheduling a call or receiving a custom quote)
- Signs off with ${companyName}
- Is plain text only — no asterisks, no markdown, no bullet dashes
- Is 3 to 4 short paragraphs

Return ONLY valid JSON with keys "subject" and "body". No other text before or after.
Example: {"subject": "Re: Your Photo Booth Inquiry", "body": "Hi Jane,\n\nThank you..."}`;

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `Gemini ${res.status}`;
    console.error('[draft-email] Gemini error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[draft-email] Could not parse JSON from Gemini response:', raw);
    return NextResponse.json({ error: 'AI returned an unexpected format. Try again.' }, { status: 500 });
  }

  const { subject, body } = JSON.parse(jsonMatch[0]);
  // Convert plain-text paragraphs to simple HTML for the rich editor
  const bodyHtml = String(body)
    .split(/\n{2,}/)
    .map((p: string) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return NextResponse.json({ subject, bodyHtml });
}
