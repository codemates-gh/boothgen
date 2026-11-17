export const dynamic = 'force-dynamic';
// Errors from people's browsers (error boundaries, src/lib/errors/report.ts), written to the server log so they show in
// Vercel → Runtime errors. Nothing is stored. Input is size-capped.
import { NextRequest, NextResponse } from 'next/server';

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => '');
  if (text.length > 12000) return NextResponse.json({ ok: false }, { status: 413 });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(text); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  console.error('[client-error]', clip(b.message, 1000), JSON.stringify({
    where: clip(b.where, 60), url: clip(b.url, 300), digest: clip(b.digest, 100), userAgent: clip(b.userAgent, 300),
    stack: clip(b.stack, 4000),
  }));
  return NextResponse.json({ ok: true });
}
