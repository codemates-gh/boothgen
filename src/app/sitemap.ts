import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma/client';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const BASE_URL = 'https://boothgen.com';

async function getPublishedBlogSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const now = new Date();
  const dbPosts = await prisma.blogPost.findMany({
    where: { publishedAt: { lte: now } },
    select: { slug: true, updatedAt: true },
  });

  const filePosts: { slug: string; updatedAt: Date }[] = [];
  const contentDir = path.join(process.cwd(), 'content', 'blog');
  try {
    if (fs.existsSync(contentDir)) {
      for (const file of fs.readdirSync(contentDir)) {
        if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue;
        const raw = fs.readFileSync(path.join(contentDir, file), 'utf-8');
        const { data } = matter(raw);
        const slug = data.slug ?? file.replace(/\.mdx?$/, '');
        const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
        if (publishedAt && publishedAt <= now && !dbPosts.find(p => p.slug === slug)) {
          filePosts.push({ slug, updatedAt: publishedAt });
        }
      }
    }
  } catch { /* no content dir */ }

  return [...dbPosts, ...filePosts];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  const blogPosts = await getPublishedBlogSlugs();

  return [
    { url: BASE_URL,                      lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/pricing`,         lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE_URL}/blog`,            lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE_URL}/sign-up`,         lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/contact`,         lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/support`,         lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/sign-in`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE_URL}/privacy`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE_URL}/terms`,           lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    ...blogPosts.map(p => ({
      url: `${BASE_URL}/blog/${p.slug}`,
      lastModified: p.updatedAt.toISOString(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
