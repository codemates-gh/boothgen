export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession();

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { title: true, eventDate: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured.' }, { status: 503 });
  }

  const branding = await prisma.tenantBranding.findUnique({
    where: { tenantId: session.tenantId },
    select: { companyName: true },
  });
  const companyName = branding?.companyName ?? 'our company';

  const { subject, body } = await req.json();

  const eventDate = event.eventDate
    ? event.eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const prompt = `You are an expert email writer for ${companyName}, a photo booth rental company. Improve the following message to the client — make it clearer, warmer, and more professional.

Client: ${event.client.firstName} ${event.client.lastName}
Event: ${event.title}${eventDate ? ` on ${eventDate}` : ''}

Current subject: ${subject}
Current message:
${body}

Rewrite rules:
- Address the client by first name (${event.client.firstName})
- Keep the core intent and information of the original message
- Use a friendly but professional tone
- Tighten wordy sentences; remove filler phrases
- Sign off with ${companyName}
- Plain text only — no asterisks, markdown, or bullet dashes
- 2 to 4 short paragraphs

Return ONLY valid JSON with keys "subject" and "body" (plain text). No other text before or after.
Example: {"subject": "Quick update on your event", "body": "Hi ${event.client.firstName},\n\n..."}`;

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `Gemini ${res.status}`;
    console.error('[message-rewrite] Gemini error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? [];
  const raw: string = parts.filter(p => !p.thought).map(p => p.text ?? '').join('') || parts.map(p => p.text ?? '').join('');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[message-rewrite] Could not parse JSON:', raw);
    return NextResponse.json({ error: 'AI returned an unexpected format. Try again.' }, { status: 500 });
  }

  const { subject: newSubject, body: newBody } = JSON.parse(jsonMatch[0]);
  return NextResponse.json({ subject: newSubject, body: newBody });
}
