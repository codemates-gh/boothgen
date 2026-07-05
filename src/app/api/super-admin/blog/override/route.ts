export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { getPost } from '@/lib/blog';

export async function POST(req: NextRequest) {
  await requireSuperAdminSession();
  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: 'DB post already exists for this slug' }, { status: 409 });

  const filePost = await getPost(slug);
  if (!filePost || filePost.source !== 'file') {
    return NextResponse.json({ error: 'File post not found' }, { status: 404 });
  }

  // Strip frontmatter — store only the markdown body in the DB post
  const body = filePost.content.replace(/^\s*---[\s\S]*?---\s*/m, '').trim();

  const post = await prisma.blogPost.create({
    data: {
      slug: filePost.slug,
      title: filePost.title,
      description: filePost.description,
      content: body,
      readingTime: filePost.readingTime,
      isHtml: false,
      publishedAt: filePost.publishedAt,
    },
  });
  return NextResponse.json(post, { status: 201 });
}
