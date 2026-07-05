'use client';
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  eventId: string;
  clientName: string;
  clientEmail: string;
}

interface Msg {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  subject: string;
  bodyText: string | null;
  sentAt: string;
  fromEmail: string;
}

export default function EventMessagePanel({ eventId, clientName, clientEmail }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [open, setOpen] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/messages`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMessages(d); });
  }, [eventId]);


  async function rewriteWithAi() {
    if (!subject.trim() && !body.trim()) { setError('Add a subject or message first.'); return; }
    setRewriting(true); setError('');
    const res = await fetch(`/api/events/${eventId}/messages/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.subject) setSubject(d.subject);
      if (d.body) setBody(d.body);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'AI rewrite failed. Try again.');
    }
    setRewriting(false);
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { setError('Subject and message are required.'); return; }
    setSending(true); setError(''); setSuccess(false);
    const res = await fetch(`/api/events/${eventId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Failed to send.');
    } else {
      const msg = await res.json();
      setMessages(m => [...m, msg]);
      setBody('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    setSending(false);
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-800">Messages</span>
          {messages.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{messages.length}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {/* Thread */}
          {messages.length > 0 && (
            <div className="max-h-72 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${m.direction === 'OUTBOUND' ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                    <p className={`text-xs font-medium mb-1 ${m.direction === 'OUTBOUND' ? 'text-white/70' : 'text-gray-400'}`}>
                      {m.direction === 'INBOUND' ? clientName : 'You'} · {formatDistanceToNow(new Date(m.sentAt))} ago
                    </p>
                    <p className="font-medium text-xs mb-1 opacity-80">{m.subject}</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.bodyText ?? '(no body)'}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Compose */}
          <div className="px-5 py-4 space-y-3 bg-white">
            {messages.length === 0 && (
              <p className="text-xs text-gray-400">No messages yet. Send the first message to {clientEmail}.</p>
            )}
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Attachments sent as replies are not captured in this thread. The outgoing email instructs clients to CC your contact email if they need to share a file.</p>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Message to ${clientName}…`}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-green-600">Message sent.</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={rewriteWithAi} disabled={rewriting || sending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors">
                <Wand2 className="w-3 h-3"/>{rewriting ? 'Rewriting…' : 'Rewrite with AI'}
              </button>
              <Button size="sm" onClick={send} disabled={sending || rewriting}>
                <Send className="w-3.5 h-3.5 mr-1.5" />{sending ? 'Sending…' : 'Send Message'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
