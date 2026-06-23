'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage, TextUIPart } from 'ai';
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const WELCOME: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: "Hi! I'm the Booth Genius assistant. Ask me anything about setting up your account, managing bookings, quotes, contracts, galleries, or any other feature." }],
};

function getMessageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is TextUIPart => p.type === 'text')
    .map(p => p.text)
    .join('');
}

type Panel = 'chat' | 'contact';
type ContactState = 'idle' | 'sending' | 'sent' | 'error';

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [input, setInput] = useState('');
  const [contactQ, setContactQ] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactState, setContactState] = useState<ContactState>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/support/chat' }),
    messages: [WELCOME],
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && panel === 'chat') setTimeout(() => inputRef.current?.focus(), 100);
    if (open && panel === 'contact') setTimeout(() => contactRef.current?.focus(), 100);
  }, [open, panel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput('');
  }

  function openContact() {
    // Pre-fill with last user question if any
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser && !contactQ) setContactQ(getMessageText(lastUser));
    setPanel('contact');
    setContactState('idle');
  }

  async function sendContactMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!contactQ.trim()) return;
    setContactState('sending');
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: contactQ.trim(), email: contactEmail.trim() || undefined }),
      });
      setContactState(res.ok ? 'sent' : 'error');
    } catch {
      setContactState('error');
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:-translate-y-0.5 hover:shadow-2xl"
        aria-label="Open support chat"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ maxHeight: '540px' }}>

          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-[#1e1247] to-[#2D1B69] px-4 py-3 flex items-center gap-3 flex-shrink-0">
            {panel === 'contact' && (
              <button onClick={() => setPanel('chat')} className="text-white/70 hover:text-white transition-colors mr-1">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              {panel === 'contact' ? <Mail className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div>
              <p className="text-white text-sm font-bold">
                {panel === 'contact' ? 'Contact Support' : 'Booth Genius Support'}
              </p>
              <p className="text-purple-300 text-xs">
                {panel === 'contact' ? "We'll get back to you by email" : 'AI-powered assistant'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-white/60 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Chat Panel ── */}
          {panel === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50" style={{ minHeight: 0 }}>
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-orange-500' : 'bg-[#2D1B69]'}`}>
                      {m.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-orange-500 text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm shadow-sm'}`}>
                      {getMessageText(m)}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#2D1B69] flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                    Something went wrong. Try again or contact support below.
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSubmit} className="border-t border-gray-100 p-3 flex gap-2 bg-white flex-shrink-0">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask a question…"
                  disabled={isLoading}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="w-9 h-9 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Contact support footer */}
              <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50 flex-shrink-0">
                <button
                  onClick={openContact}
                  className="text-xs text-gray-400 hover:text-orange-500 transition-colors flex items-center gap-1.5 w-full justify-center"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Still need help? Send a message to our team →
                </button>
              </div>
            </>
          )}

          {/* ── Contact Panel ── */}
          {panel === 'contact' && (
            <div className="flex-1 flex flex-col p-5 bg-white overflow-y-auto">
              {contactState === 'sent' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                  <p className="font-semibold text-gray-900">Message sent!</p>
                  <p className="text-sm text-gray-500">
                    {contactEmail ? `We'll reply to ${contactEmail} as soon as possible.` : "We'll look into this as soon as possible."}
                  </p>
                  <button
                    onClick={() => { setPanel('chat'); setContactQ(''); setContactEmail(''); setContactState('idle'); }}
                    className="mt-2 text-sm text-orange-500 hover:underline"
                  >
                    Back to chat
                  </button>
                </div>
              ) : (
                <form onSubmit={sendContactMessage} className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-4">
                      Didn&apos;t find your answer? Send us a message and we&apos;ll get back to you.
                    </p>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Your question</label>
                    <textarea
                      ref={contactRef}
                      value={contactQ}
                      onChange={e => setContactQ(e.target.value)}
                      rows={4}
                      placeholder="Describe what you need help with…"
                      required
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Your email (for reply)</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <p className="text-xs text-gray-400 mt-1">Optional — include if you want us to reply.</p>
                  </div>
                  {contactState === 'error' && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                      Something went wrong. Please email us directly at support@boothgen.com.
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={contactState === 'sending' || !contactQ.trim()}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
                  >
                    {contactState === 'sending' ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Message</>}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
