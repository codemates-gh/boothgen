import { getPost, getAllPosts } from '@/lib/blog';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { MarketingNav } from '@/app/MarketingNav';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, ArrowLeft } from 'lucide-react';

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `https://boothgen.com/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://boothgen.com/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt?.toISOString(),
      images: [{ url: `/api/og?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.description.slice(0, 80))}`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post || (post.publishedAt && new Date(post.publishedAt) > new Date())) notFound();

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-white">
        <article className="max-w-2xl mx-auto px-4 py-16">
          <div className="mb-8">
            <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
              <ArrowLeft className="w-4 h-4"/>Back to Blog
            </Link>
            <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-3">Booth Genius</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">{post.title}</h1>
            {post.description && <p className="text-lg text-gray-500 leading-relaxed mb-6">{post.description}</p>}
            <div className="flex items-center gap-4 text-sm text-gray-400 pb-8 border-b border-gray-100">
              {post.publishedAt && <span>{format(new Date(post.publishedAt), 'MMMM d, yyyy')}</span>}
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/>{post.readingTime} min read</span>
            </div>
          </div>

          {post.isHtml ? (
            <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.content }}/>
          ) : (
            <div className="blog-prose">
              <MDXRemote source={post.content}/>
            </div>
          )}

          {/* CTA */}
          <div className="mt-16 p-8 bg-gradient-to-br from-[#1e1247] to-[#2d1b6e] rounded-2xl text-center">
            <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-3">Ready to simplify your business?</p>
            <h2 className="text-2xl font-extrabold text-white mb-3">Try Booth Genius Free</h2>
            <p className="text-purple-200 text-sm mb-6">6 tools in one platform. No monthly fees to start. Built for photo booth operators.</p>
            <Link href="/sign-up"
              className="inline-block px-8 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all">
              Start Free — No Card Required
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-gray-100 py-10 px-4 text-center">
        <div className="flex justify-center mb-4"><BoothGeniusLogo size="sm" showTagline={false}/></div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400 mb-4">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
          <Link href="/blog" className="hover:text-gray-600">Blog</Link>
          <Link href="/support" className="hover:text-gray-600">Support</Link>
        </div>
        <p className="text-xs text-gray-300">© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
      </footer>
    </>
  );
}
