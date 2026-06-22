'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Save, Send, ArrowRight, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'New', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'QUOTED', label: 'Quoted', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'CONVERTED', label: 'Converted', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'CLOSED_LOST', label: 'Closed Lost', color: 'bg-gray-100 text-gray-600 border-gray-200' },
] as const;

type LeadMessage = {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: string;
};

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  eventDate: string | null;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueState: string | null;
  venuePostalCode: string | null;
  guestCount: number | null;
  message: string | null;
  notes: string | null;
  status: string;
  convertedToEventId: string | null;
  createdAt: string;
  messages: LeadMessage[];
};

export function LeadDetail({ lead: initial }: { lead: Lead }) {
  const router = useRouter();
  const [lead, setLead] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [emailSubject, setEmailSubject] = useState(`Re: Your Photo Booth Inquiry`);
  const [emailBody, setEmailBody] = useState(`Hi ${initial.firstName},\n\nThank you for your inquiry! I'd love to learn more about your event.\n\n`);
  const [emailSent, setEmailSent] = useState(false);
  const [messages, setMessages] = useState<LeadMessage[]>(initial.messages);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reply' | 'thread'>('details');
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'thread') threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab, messages]);

  const statusOption = STATUS_OPTIONS.find(s => s.value === lead.status) ?? STATUS_OPTIONS[0];

  async function saveDetails() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        eventDate: lead.eventDate,
        eventType: lead.eventType,
        startTime: lead.startTime,
        endTime: lead.endTime,
        venueName: lead.venueName,
        venueAddress: lead.venueAddress,
        venueCity: lead.venueCity,
        venueState: lead.venueState,
        venuePostalCode: lead.venuePostalCode,
        guestCount: lead.guestCount,
        message: lead.message,
        notes: lead.notes,
        status: lead.status,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function changeStatus(value: string) {
    setLead(l => ({ ...l, status: value }));
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: value }),
    });
  }

  async function sendReply() {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSending(true);
    const res = await fetch(`/api/leads/${lead.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: emailSubject, body: emailBody }),
    });
    setSending(false);
    if (res.ok) {
      setEmailSent(true);
      if (lead.status === 'NEW') setLead(l => ({ ...l, status: 'CONTACTED' }));
      await refreshMessages();
      setActiveTab('thread');
      setEmailBody(`Hi ${lead.firstName},\n\n`);
    }
  }

  async function refreshMessages() {
    setRefreshing(true);
    const res = await fetch(`/api/leads/${lead.id}/messages`);
    if (res.ok) setMessages(await res.json());
    setRefreshing(false);
  }

  async function convertToEvent() {
    setConverting(true);
    const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' });
    const data = await res.json();
    if (data.eventId) {
      router.push(`/events/${data.eventId}/edit`);
    }
    setConverting(false);
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/leads" className="mt-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{lead.firstName} {lead.lastName}</h1>
            <div className="relative group">
              <button className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer ${statusOption.color}`}>
                {statusOption.label} ▾
              </button>
              <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => changeStatus(opt.value)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 ${lead.status === opt.value ? 'font-bold' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-500">Submitted {format(new Date(lead.createdAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {lead.convertedToEventId ? (
            <>
              <Link href={`/events/${lead.convertedToEventId}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  View Event <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link href={`/quotes/new?eventId=${lead.convertedToEventId}`}>
                <Button size="sm" className="gap-1.5">
                  Generate Quote <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          ) : (
            <Button onClick={convertToEvent} disabled={converting} size="sm" className="gap-1.5">
              {converting ? 'Converting…' : 'Convert to Event'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['details', 'thread', 'reply'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'reply' ? 'Compose' : tab === 'thread' ? `Thread${messages.length > 0 ? ` (${messages.length})` : ''}` : 'Details'}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" value={lead.firstName} onChange={v => setLead(l => ({ ...l, firstName: v }))} />
              <Field label="Last Name" value={lead.lastName} onChange={v => setLead(l => ({ ...l, lastName: v }))} />
              <Field label="Email" value={lead.email} onChange={v => setLead(l => ({ ...l, email: v }))} type="email" />
              <Field label="Phone" value={lead.phone ?? ''} onChange={v => setLead(l => ({ ...l, phone: v }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Event Date" value={lead.eventDate ? lead.eventDate.split('T')[0] : ''} onChange={v => setLead(l => ({ ...l, eventDate: v }))} type="date" />
              <Field label="Event Type" value={lead.eventType ?? ''} onChange={v => setLead(l => ({ ...l, eventType: v }))} placeholder="Wedding, Corporate, Birthday…" />
              <Field label="Start Time" value={lead.startTime ?? ''} onChange={v => setLead(l => ({ ...l, startTime: v }))} type="time" />
              <Field label="End Time" value={lead.endTime ?? ''} onChange={v => setLead(l => ({ ...l, endTime: v }))} type="time" />
              <Field label="Guest Count" value={lead.guestCount?.toString() ?? ''} onChange={v => setLead(l => ({ ...l, guestCount: v ? parseInt(v) : null }))} type="number" />
              <div className="sm:col-span-2 border-t pt-4 mt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Venue</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Venue Name" value={lead.venueName ?? ''} onChange={v => setLead(l => ({ ...l, venueName: v }))} />
                  <Field label="Address" value={lead.venueAddress ?? ''} onChange={v => setLead(l => ({ ...l, venueAddress: v }))} />
                  <Field label="City" value={lead.venueCity ?? ''} onChange={v => setLead(l => ({ ...l, venueCity: v }))} />
                  <Field label="State" value={lead.venueState ?? ''} onChange={v => setLead(l => ({ ...l, venueState: v }))} placeholder="MD" />
                  <Field label="Postal Code" value={lead.venuePostalCode ?? ''} onChange={v => setLead(l => ({ ...l, venuePostalCode: v }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Message from Inquiry</label>
                <textarea
                  value={lead.message ?? ''}
                  onChange={e => setLead(l => ({ ...l, message: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
                <textarea
                  value={lead.notes ?? ''}
                  onChange={e => setLead(l => ({ ...l, notes: e.target.value }))}
                  rows={3}
                  placeholder="Private notes visible only to your team…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveDetails} disabled={saving} className="gap-2 min-w-[110px]">
              {saved ? <><CheckCircle className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save Changes</>}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'thread' && (
        <div className="space-y-1">
          <div className="flex justify-end mb-3">
            <button onClick={refreshMessages} disabled={refreshing} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {messages.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-gray-400">No messages yet. Send a reply to start the conversation.</CardContent></Card>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.direction === 'OUTBOUND' ? 'bg-brand text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'}`}>
                  <p className={`text-xs font-medium mb-1 ${m.direction === 'OUTBOUND' ? 'text-orange-100' : 'text-gray-500'}`}>
                    {m.direction === 'OUTBOUND' ? 'You' : lead.firstName} · {format(new Date(m.sentAt), 'MMM d, h:mm a')}
                  </p>
                  <p className="font-semibold text-xs mb-1 opacity-80">{m.subject}</p>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.bodyText || m.subject}</div>
                </div>
              </div>
            ))
          )}
          <div ref={threadEndRef} />
          <div className="pt-4 text-center">
            <button onClick={() => setActiveTab('reply')} className="text-xs text-brand font-medium hover:underline">
              + Compose new reply
            </button>
          </div>
        </div>
      )}

      {activeTab === 'reply' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Send Email to {lead.firstName} {lead.lastName}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {emailSent ? (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg px-4 py-3 text-sm font-medium">
                <CheckCircle className="w-4 h-4" /> Email sent successfully.
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                readOnly
                value={lead.email}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none font-mono"
              />
            </div>
            <p className="text-xs text-gray-400">Replies from the client will go directly to your email address on file.</p>
            <div className="flex justify-end">
              <Button onClick={sendReply} disabled={sending || !emailSubject.trim() || !emailBody.trim()} className="gap-2">
                <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send Email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />
    </div>
  );
}
