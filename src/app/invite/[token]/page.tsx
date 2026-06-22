'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';
import Link from 'next/link';

type InviteInfo = {
  email: string;
  hasPassword: boolean;
  companyName: string;
  role: string;
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setInfo(d); })
      .finally(() => setLoadingInfo(false));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await fetch(`/api/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: !info?.hasPassword ? password : undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setDone(true);
    else setError(data.error || 'Something went wrong');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4">
            <BoothGeniusIcon size={68} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Team Invitation</h1>
        </div>

        {loadingInfo ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : notFound ? (
          <div className="text-center space-y-4">
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-sm text-gray-600">This invitation is invalid or has already been used.</p>
            <Link href="/sign-in" className="block w-full py-2.5 bg-brand text-white font-semibold rounded-xl text-sm text-center hover:bg-brand-dark transition-colors">
              Go to Sign In
            </Link>
          </div>
        ) : done ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <div>
              <p className="font-medium text-gray-900">Invitation accepted!</p>
              <p className="text-sm text-gray-500 mt-1">Sign in to access your account.</p>
            </div>
            <button onClick={() => router.push('/sign-in')} className="w-full py-2.5 bg-brand text-white font-semibold rounded-xl text-sm hover:bg-brand-dark transition-colors">
              Sign In
            </button>
          </div>
        ) : info ? (
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
              <p className="text-gray-500">Invited to join</p>
              <p className="font-semibold text-gray-900">{info.companyName}</p>
              <p className="text-gray-500 text-xs mt-1">as {info.role.replace('_', ' ').toLowerCase()}</p>
            </div>
            <p className="text-sm text-gray-600">Accepting invitation for <strong>{info.email}</strong></p>

            {!info.hasPassword && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Create a password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required={!info.hasPassword}
                    minLength={8}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || (!info.hasPassword && password.length < 8)}
              className="w-full py-2.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Accepting...' : 'Accept Invitation'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
