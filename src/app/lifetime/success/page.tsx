import Link from 'next/link';
import { CheckCircle, Mail } from 'lucide-react';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';

export const metadata = { title: 'Welcome, Founding Member — Booth Genius', robots: 'noindex' };

export default function LifetimeSuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full bg-white rounded-2xl border-2 border-green-400 shadow-xl shadow-green-100 p-10 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />

          <h1 className="text-3xl font-extrabold text-gray-900 mb-3">You&apos;re a Founding Member!</h1>
          <p className="text-gray-500 text-base mb-8">
            Your payment was processed. Check your inbox — we&apos;re sending you a setup link to create your Booth Genius account.
          </p>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-8 text-left space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Check your email</p>
                <p className="text-xs text-gray-500 mt-0.5">A setup link is on its way. You can use any email for your Booth Genius account — it doesn&apos;t need to match your payment email.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Lifetime Pro access</p>
                <p className="text-xs text-gray-500 mt-0.5">Zero monthly fees. Zero commission cuts. Every Pro feature — forever.</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-400">
            Didn&apos;t receive the email?{' '}
            <Link href="/support" className="text-orange-500 hover:underline font-medium">Contact support →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
