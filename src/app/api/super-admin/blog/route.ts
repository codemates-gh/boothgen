export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  await requireSuperAdminSession();
  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, title: true, description: true, readingTime: true, publishedAt: true, createdAt: true, updatedAt: true, isHtml: true },
  });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  await requireSuperAdminSession();
  const { slug, title, description, content, readingTime, publishedAt } = await req.json();
  if (!slug || !title || !content) return NextResponse.json({ error: 'slug, title, and content are required' }, { status: 400 });

  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: 'A post with that slug already exists' }, { status: 409 });

  const post = await prisma.blogPost.create({
    data: {
      slug,
      title,
      description: description ?? '',
      content,
      readingTime: readingTime ?? Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
      isHtml: true,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    },
  });
  return NextResponse.json(post, { status: 201 });
}
