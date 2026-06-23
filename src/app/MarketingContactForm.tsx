'use client';
import { useState } from 'react';
import { Send, CheckCircle, Loader2 } from 'lucide-react';

type State = 'idle' | 'sending' | 'sent' | 'error';

const TOPICS = [
  'General question',
  'Technical issue',
  'Billing / plan question',
  'Feature request',
  'Partnership inquiry',
  'Other',
];

export function MarketingContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<State>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `[${topic || 'General'}] From: ${name}\n\n${message}`,
          email: email || undefined,
        }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Message sent!</h3>
        <p className="text-gray-500">
          {email
            ? `We'll reply to ${email} as soon as possible.`
            : "We'll look into your message as soon as possible."}
        </p>
        <button
          onClick={() => { setName(''); setEmail(''); setTopic(''); setMessage(''); setState('idle'); }}
          className="mt-6 text-sm text-orange-500 hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Topic</label>
        <select
          value={topic}
          onChange={e => setTopic(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 bg-white"
        >
          <option value="">Select a topic…</option>
          {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Message <span className="text-red-400">*</span></label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          rows={4}
          placeholder="Tell us how we can help…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
      </div>

      {state === 'error' && (
        <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">
          Something went wrong. Email us directly at <a href="mailto:support@boothgen.com" className="underline">support@boothgen.com</a>.
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'sending' || !message.trim()}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-colors text-sm"
      >
        {state === 'sending'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
          : <><Send className="w-4 h-4" /> Send Message</>}
      </button>
    </form>
  );
}
