'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, ArrowRight, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Msg {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  subject: string;
  bodyText: string | null;
  sentAt: string;
  fromEmail: string;
  toEmail: string;
  leadId: string | null;
  eventId: string | null;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    convertedToEventId: string | null;
  } | null;
  event: {
    id: string;
    title: string;
    client: { firstName: string; lastName: string; email: string };
  } | null;
}

interface Thread {
  key: string;
  name: string;
  email: string;
  latest: Msg;
  count: number;
  leadId: string | null;
  eventId: string | null;
  eventTitle: string | null;
}

function buildThreads(messages: Msg[]): Thread[] {
  const map = new Map<string, { msgs: Msg[]; name: string; email: string; leadId: string | null; eventId: string | null; eventTitle: string | null }>();

  for (const m of messages) {
    // Key by lead → converted event if available, otherwise by eventId, otherwise by leadId
    const key = m.lead?.convertedToEventId ?? m.eventId ?? m.leadId ?? m.id;
    const name = m.lead
      ? `${m.lead.firstName} ${m.lead.lastName}`
      : m.event
      ? `${m.event.client.firstName} ${m.event.client.lastName}`
      : m.direction === 'INBOUND' ? m.fromEmail : m.toEmail;
    const email = m.lead?.email ?? m.event?.client.email ?? (m.direction === 'INBOUND' ? m.fromEmail : m.toEmail);

    if (!map.has(key)) {
      map.set(key, { msgs: [], name, email, leadId: m.leadId, eventId: m.eventId ?? m.lead?.convertedToEventId ?? null, eventTitle: m.event?.title ?? null });
    }
    map.get(key)!.msgs.push(m);
  }

  return Array.from(map.entries())
    .map(([key, { msgs, name, email, leadId, eventId, eventTitle }]) => ({
      key,
      name,
      email,
      latest: msgs[0],
      count: msgs.length,
      leadId,
      eventId,
      eventTitle,
    }))
    .sort((a, b) => new Date(b.latest.sentAt).getTime() - new Date(a.latest.sentAt).getTime());
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/messages').then(r => r.json()).then(d => {
      setMessages(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const threads = buildThreads(messages);

  return (
    <>
      <TopBar title="Messages" />
      <div className="p-4 sm:p-8">
        <p className="text-sm text-gray-500 mb-4">{loading ? 'Loading…' : `${threads.length} conversation${threads.length !== 1 ? 's' : ''}`}</p>

        <Card><CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No messages yet. Send a message from an event or lead.</p>
            </div>
          ) : (
            <ul>
              {threads.map((t, i) => {
                const href = t.eventId
                  ? `/events/${t.eventId}#messages`
                  : t.leadId
                  ? `/leads/${t.leadId}`
                  : '#';
                const preview = t.latest.bodyText
                  ? t.latest.bodyText.slice(0, 120) + (t.latest.bodyText.length > 120 ? '…' : '')
                  : '(no body)';

                return (
                  <li key={t.key} className={`${i < threads.length - 1 ? 'border-b' : ''}`}>
                    <Link href={href} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Mail className="w-4 h-4 text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm text-gray-900 truncate">{t.name}</p>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatDistanceToNow(new Date(t.latest.sentAt))} ago</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mb-1">{t.latest.subject}</p>
                        <p className="text-xs text-gray-400 truncate">{preview}</p>
                        {t.eventTitle && (
                          <p className="text-xs text-brand mt-1 font-medium">→ {t.eventTitle}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                        {t.count > 1 && <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{t.count}</span>}
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
