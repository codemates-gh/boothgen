'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function ClaimForm({ enabled, price, round }: { enabled: boolean; price: number; round: number }) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lifetime/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), company: company.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-3">
        <input
          type="email"
          placeholder="Your email"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          className="w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-800 text-white font-bold text-base transition-colors"
          onClick={() => alert('Thanks! Geoffrey will reach out when the next batch of spots opens.')}
          type="button"
        >
          Join Waitlist
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        placeholder="Your name *"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <input
        type="email"
        placeholder="Payment email *"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <input
        type="text"
        placeholder="Business name (optional)"
        value={company}
        onChange={e => setCompany(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !name.trim() || !email.trim()}
        className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-base transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Redirecting to payment…' : `Claim My Founding Spot — $${price}`}
      </button>

      <p className="text-[11px] text-gray-400 text-center">
        Secure payment via Stripe · 14-day refund guarantee · Round {round} only
      </p>
    </form>
  );
}
