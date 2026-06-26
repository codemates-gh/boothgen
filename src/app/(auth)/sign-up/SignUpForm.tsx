'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';

interface Props {
  hasTerms: boolean;
  hasPrivacy: boolean;
}

export default function SignUpForm({ hasTerms, hasPrivacy }: Props) {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' });
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const pwStrength = form.password.length === 0 ? null : form.password.length < 8 ? 'weak' : form.password.length < 12 ? 'good' : 'strong';
  const strengthColor = { weak: 'bg-red-400', good: 'bg-yellow-400', strong: 'bg-green-500' };
  const strengthWidth = { weak: 'w-1/3', good: 'w-2/3', strong: 'w-full' };

  const hasLegal = hasTerms || hasPrivacy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (hasLegal && !agreed) { setError('Please accept the Terms of Service and Privacy Policy'); return; }
    setLoading(true); setError('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, email: form.email, password: form.password }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Registration failed'); setLoading(false); return; }
    await signIn('credentials', { email: form.email, password: form.password, callbackUrl: '/onboarding', redirect: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <BoothGeniusIcon size={68} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start your free trial today</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0"/>{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input type="text" value={form.name} onChange={e => set('name',e.target.value)} placeholder="Jane Smith" required autoComplete="name"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => set('email',e.target.value)} placeholder="you@example.com" required autoComplete="email"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password',e.target.value)} placeholder="Min. 8 characters" required autoComplete="new-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"/>
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
            {pwStrength && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={'h-full rounded-full transition-all ' + (strengthColor[pwStrength] ?? '') + ' ' + (strengthWidth[pwStrength] ?? '')}/>
                </div>
                <p className="text-xs text-gray-400 mt-1 capitalize">{pwStrength} password</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
            <div className="relative">
              <input type="password" value={form.confirm} onChange={e => set('confirm',e.target.value)} placeholder="Re-enter password" required autoComplete="new-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"/>
              {form.confirm && form.confirm === form.password && <CheckCircle2 className="w-4 h-4 text-green-500 absolute right-3 top-1/2 -translate-y-1/2"/>}
            </div>
          </div>

          {hasLegal && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand flex-shrink-0"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to the{' '}
                {hasTerms
                  ? <Link href="/terms" target="_blank" className="text-brand font-medium hover:underline">Terms of Service</Link>
                  : <span className="font-medium">Terms of Service</span>}
                {hasTerms && hasPrivacy && ' and '}
                {hasPrivacy
                  ? <Link href="/privacy" target="_blank" className="text-brand font-medium hover:underline">Privacy Policy</Link>
                  : null}
              </span>
            </label>
          )}

          <button type="submit" disabled={loading || !form.name || !form.email || !form.password || !form.confirm || !!(hasLegal && !agreed)}
            className="w-full py-2.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"/></div>
          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-medium">or sign up with</span></div>
        </div>

        <button onClick={() => signIn('google', { callbackUrl: '/onboarding' })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account? <Link href="/sign-in" className="text-brand font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
