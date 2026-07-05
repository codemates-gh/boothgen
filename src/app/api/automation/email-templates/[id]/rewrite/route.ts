export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const template = await prisma.emailTemplate.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { name: true },
  });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured.' }, { status: 503 });
  }

  const { subject, bodyHtml } = await req.json();
  const bodyText = stripHtml(bodyHtml ?? '');

  const prompt = `You are an expert email copywriter for a photo booth rental business. Improve the following email template to make it clearer, warmer, and more compelling — while keeping all {{merge_tag}} placeholders exactly as-is.

Template name: ${template.name}
Current subject: ${subject}
Current body:
${bodyText}

Rewrite rules:
- Keep all {{variable}} merge tags unchanged and in place
- Preserve the general structure and purpose of the email
- Make the tone professional but friendly and approachable
- Tighten wordy sentences; remove filler phrases
- Ensure there is a clear call-to-action if appropriate
- Do not add asterisks, markdown, or bullet dashes
- 3 to 5 short paragraphs max

Return ONLY valid JSON with keys "subject" and "body" (plain text body, no HTML). No other text before or after.
Example: {"subject": "Your Photo Booth is Confirmed!", "body": "Hi {{client.first_name}},\n\nWe are thrilled..."}`;

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
    console.error('[template-rewrite] Gemini error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? [];
  const raw: string = parts.filter(p => !p.thought).map(p => p.text ?? '').join('') || parts.map(p => p.text ?? '').join('');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[template-rewrite] Could not parse JSON:', raw);
    return NextResponse.json({ error: 'AI returned an unexpected format. Try again.' }, { status: 500 });
  }

  const { subject: newSubject, body } = JSON.parse(jsonMatch[0]);
  const newBodyHtml = String(body)
    .split(/\n{2,}/)
    .map((p: string) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return NextResponse.json({ subject: newSubject, bodyHtml: newBodyHtml });
}
