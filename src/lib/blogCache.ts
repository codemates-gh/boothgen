import { revalidatePath } from 'next/cache';

// Super Admin blog changes show right away instead of after the hourly refresh
export function refreshBlog(...slugs: (string | null | undefined)[]) {
  revalidatePath('/blog');
  revalidatePath('/sitemap.xml');
  for (const s of slugs) if (s) revalidatePath(`/blog/${s}`);
}
