import { getAllPosts } from '@/lib/blog';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketingNav } from '@/app/MarketingNav';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { format } from 'date-fns';
import { Clock, ArrowRight } from 'lucide-react';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Blog — Photo Booth Business Tips & Insights',
  description: 'Practical guides and insights for photo booth operators — CRM tips, workflow automation, team management, and growing your rental business.',
  keywords: ['photo booth business tips', 'photo booth operator guide', 'photo booth CRM blog', 'booth rental software tips'],
  alternates: { canonical: 'https://boothgen.com/blog' },
  openGraph: {
    title: 'Booth Genius Blog — Photo Booth Business Tips & Insights',
    description: 'Practical guides for photo booth operators: CRM, automation, client experience, and business growth.',
    url: 'https://boothgen.com/blog',
    images: [{ url: '/api/og?title=The+Booth+Genius+Blog&subtitle=Tips+%26+insights+for+photo+booth+operators', width: 1200, height: 630, alt: 'Booth Genius Blog' }],
  },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-white">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#1e1247] to-[#2d1b6e] py-20 px-4 text-center">
          <div className="max-w-2xl mx-auto">
            <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-4">The Booth Genius Blog</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">Grow Your Photo Booth Business</h1>
            <p className="text-lg text-purple-200">Practical guides, feature deep-dives, and business tips for photo booth operators — straight from people who&apos;ve run the business.</p>
          </div>
        </section>

        {/* Posts grid */}
        <section className="max-w-5xl mx-auto px-4 py-16">
          {posts.length === 0 ? (
            <p className="text-center text-gray-400 py-16">No posts yet — check back soon.</p>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => (
                <Link key={post.slug} href={`/blog/${post.slug}`}
                  className="group flex flex-col border border-gray-200 rounded-2xl overflow-hidden hover:border-orange-300 hover:shadow-lg transition-all">
                  <div className="flex-1 p-6">
                    <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-3">Booth Genius</p>
                    <h2 className="font-bold text-gray-900 text-base leading-snug mb-3 group-hover:text-orange-600 transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">{post.description}</p>
                  </div>
                  <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {post.publishedAt && <span>{format(new Date(post.publishedAt), 'MMM d, yyyy')}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{post.readingTime} min</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-500 transition-colors"/>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 px-4 text-center">
        <div className="flex justify-center mb-4"><BoothGeniusLogo size="sm" showTagline={false}/></div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400 mb-4">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
          <Link href="/blog" className="hover:text-gray-600">Blog</Link>
          <Link href="/support" className="hover:text-gray-600">Support</Link>
          <Link href="/contact" className="hover:text-gray-600">Contact</Link>
        </div>
        <p className="text-xs text-gray-300">© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
      </footer>
    </>
  );
}
