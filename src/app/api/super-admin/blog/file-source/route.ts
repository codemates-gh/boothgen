export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  await requireSuperAdminSession();
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const dir = path.join(process.cwd(), 'content', 'blog');
  for (const ext of ['.mdx', '.md']) {
    const candidates = [`${slug}${ext}`];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(ext))) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const match = raw.match(/^---[\s\S]*?slug:\s*["']?([^"'\n]+)["']?/m);
      const fileSlug = match?.[1]?.trim() ?? file.replace(/\.mdx?$/, '');
      if (fileSlug === slug) {
        return NextResponse.json({ raw });
      }
    }
  }
  return NextResponse.json({ error: 'File not found' }, { status: 404 });
}
