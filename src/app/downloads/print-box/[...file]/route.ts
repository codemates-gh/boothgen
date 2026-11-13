export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Genie print box (Windows) installer + electron-updater feed. The files live in the
// `genie-downloads` R2 bucket (print-box/ folder) on its public r2.dev address; print boxes
// are built to fetch https://boothgen.com/downloads/print-box/<file>, so this forwards there.
// Temporary redirect, never cached: GENIE_DOWNLOADS_URL can move without breaking boxes.
// Public (no session): print boxes download anonymously.
export async function GET(_: NextRequest, { params }: { params: { file: string[] } }) {
  const base = process.env.GENIE_DOWNLOADS_URL?.trim().replace(/\/+$/, '');
  const parts = params.file ?? [];
  if (!base || !parts.length || parts.some(p => !p || p === '.' || p === '..')) {
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const target = `${base}/print-box/${parts.map(encodeURIComponent).join('/')}`;
  return new NextResponse(null, { status: 307, headers: { Location: target, 'Cache-Control': 'no-store' } });
}

export const HEAD = GET;
