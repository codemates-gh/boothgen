export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperAdminSession();
  const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperAdminSession();
  const { slug, title, description, content, readingTime, publishedAt } = await req.json();

  if (slug) {
    const conflict = await prisma.blogPost.findFirst({ where: { slug, NOT: { id: params.id } } });
    if (conflict) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  }

  const post = await prisma.blogPost.update({
    where: { id: params.id },
    data: {
      ...(slug !== undefined && { slug }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(content !== undefined && {
        content,
        readingTime: readingTime ?? Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
      }),
      ...(readingTime !== undefined && { readingTime }),
      publishedAt: publishedAt === null ? null : publishedAt ? new Date(publishedAt) : undefined,
    },
  });
  return NextResponse.json(post);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperAdminSession();
  await prisma.blogPost.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
