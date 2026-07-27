import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { AlertCircle, Star } from 'lucide-react';
import { SetupForm } from '../SetupForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set Up Your Account — Booth Genius', robots: 'noindex' };

export default async function SetupPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';

  if (!token) {
    return <ErrorPage message="This setup link is invalid. Please use the link from your founding member email." />;
  }

  const member = await prisma.foundingMember.findUnique({
    where: { setupToken: token },
    select: { id: true, paymentEmail: true, name: true, company: true, status: true, setupTokenUsedAt: true },
  });

  if (!member) {
    return <ErrorPage message="This setup link is invalid or has expired. Please contact support." />;
  }

  if (member.status === 'SETUP_COMPLETE') {
    return (
      <Layout>
        <div className="text-center">
          <p className="text-gray-500 mb-4">Your account is already set up.</p>
          <Link href="/sign-in" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl transition-colors">
            Sign In →
          </Link>
        </div>
      </Layout>
    );
  }

  if (member.status !== 'PAID') {
    return <ErrorPage message="This link is associated with an incomplete payment. Please contact support." />;
  }

  return (
    <Layout>
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 mb-4">
          <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
          <span className="text-xs font-bold text-orange-700 uppercase tracking-widest">Founding Member</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">
          {member.name ? `Welcome, ${member.name.split(' ')[0]}!` : 'Set up your account'}
        </h1>
        <p className="text-sm text-gray-500">Create your Booth Genius account below. You can use any email — it doesn&apos;t need to match your payment email.</p>
      </div>

      <SetupForm
        token={token}
        paymentEmail={member.paymentEmail}
        name={member.name}
        company={member.company}
      />
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <Layout>
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Setup link issue</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <Link href="/support" className="text-orange-500 font-medium hover:underline text-sm">Contact support →</Link>
      </div>
    </Layout>
  );
}
