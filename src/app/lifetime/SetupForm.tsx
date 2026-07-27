'use client';
import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export function SetupForm({ token, paymentEmail, name: paymentName, company: paymentCompany }: {
  token: string;
  paymentEmail: string;
  name?: string | null;
  company?: string | null;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [company,   setCompany]   = useState(paymentCompany ?? '');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !company.trim() || password.length < 8) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lifetime/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim().toLowerCase(),
          company:   company.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-5">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account created!</h2>
          <p className="text-gray-500 text-sm">Sign in with your email and password to access your Founding Member dashboard.</p>
        </div>
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl transition-colors"
        >
          Sign In to Your Account →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 mb-1">Your Stripe receipt was sent to: <span className="font-medium text-gray-700">{paymentEmail}</span></p>
        <p className="text-xs text-gray-400">Your Booth Genius account can use a different email if you prefer.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text" placeholder="First name *" value={firstName}
          onChange={e => setFirstName(e.target.value)} required
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <input
          type="text" placeholder="Last name *" value={lastName}
          onChange={e => setLastName(e.target.value)} required
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
      <input
        type="email" placeholder="Account email *" value={email}
        onChange={e => setEmail(e.target.value)} required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <input
        type="text" placeholder="Business / company name *" value={company}
        onChange={e => setCompany(e.target.value)} required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <div>
        <input
          type="password" placeholder="Password * (min 8 characters)" value={password}
          onChange={e => setPassword(e.target.value)} required minLength={8}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {password.length > 0 && password.length < 8 && (
          <p className="text-xs text-red-400 mt-1">At least 8 characters required</p>
        )}
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !firstName.trim() || !lastName.trim() || !email.trim() || !company.trim() || password.length < 8}
        className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-base transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Creating your account…' : 'Create My Account →'}
      </button>
    </form>
  );
}
