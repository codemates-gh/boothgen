import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — Booth Genius' };

export default async function PrivacyPage() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'privacy_content' } });
  if (!setting?.value?.trim()) notFound();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
          <Link href="/sign-up" className="text-sm text-brand font-medium hover:underline">Get Started Free</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
          {setting.value}
        </div>
      </main>
      <footer className="border-t border-gray-100 py-6 px-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Booth Genius. All rights reserved.
      </footer>
    </div>
  );
}
