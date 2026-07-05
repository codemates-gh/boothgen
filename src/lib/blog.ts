import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { prisma } from '@/lib/prisma/client';

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  readingTime: number;
  publishedAt: Date | null;
  isHtml: boolean;
  source: 'db' | 'file';
}

export interface BlogPost extends BlogPostMeta {
  content: string;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');

function readFilePosts(): BlogPost[] {
  try {
    if (!fs.existsSync(CONTENT_DIR)) return [];
    return fs
      .readdirSync(CONTENT_DIR)
      .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
      .map(file => {
        const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
        const { data, content } = matter(raw);
        return {
          slug: data.slug ?? file.replace(/\.mdx?$/, ''),
          title: data.title ?? '',
          description: data.description ?? '',
          readingTime: data.readingTime ?? Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
          isHtml: false,
          source: 'file' as const,
          content,
        };
      });
  } catch {
    return [];
  }
}

export async function getAllPosts(includeUnpublished = false): Promise<BlogPostMeta[]> {
  const now = new Date();
  const [dbPosts, filePosts] = await Promise.all([
    prisma.blogPost.findMany({
      where: includeUnpublished ? {} : { publishedAt: { lte: now } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, title: true, description: true, readingTime: true, publishedAt: true, isHtml: true, createdAt: true, updatedAt: true },
    }),
    Promise.resolve(readFilePosts()),
  ]);

  const dbSlugs = new Set(dbPosts.map(p => p.slug));

  const fileVisible = filePosts.filter(p =>
    includeUnpublished || (p.publishedAt && p.publishedAt <= now)
  );

  const merged: BlogPostMeta[] = [
    ...dbPosts.map(p => ({ ...p, source: 'db' as const })),
    ...fileVisible.filter(p => !dbSlugs.has(p.slug)).map(({ content: _c, ...rest }) => rest),
  ];

  return merged.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });
}

export async function getAllPostsAdmin(): Promise<BlogPostMeta[]> {
  return getAllPosts(true);
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const dbPost = await prisma.blogPost.findUnique({ where: { slug } });
  if (dbPost) return { ...dbPost, source: 'db' };

  const filePosts = readFilePosts();
  return filePosts.find(p => p.slug === slug) ?? null;
}
