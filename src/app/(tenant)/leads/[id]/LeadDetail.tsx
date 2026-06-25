'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Save, Send, ArrowRight, CheckCircle, RefreshCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';

type EmailTemplate = { id: string; name: string; subject: string; bodyHtml: string };
type Branding = { companyName?: string; replyToEmail?: string; supportPhone?: string; websiteUrl?: string; emailHeaderHtml?: string };

const LEAD_MERGE_TAGS = [
  { label: 'Client First Name', value: '{{client.first_name}}' },
  { label: 'Client Full Name', value: '{{client.full_name}}' },
  { label: 'Client Email', value: '{{client.email}}' },
  { label: 'Client Phone', value: '{{client.phone}}' },
  { label: 'Event Date', value: '{{event.date}}' },
  { label: 'Event Start Time', value: '{{event.start_time}}' },
  { label: 'Event End Time', value: '{{event.end_time}}' },
  { label: 'Venue Name', value: '{{event.venue_name}}' },
  { label: 'Company Name', value: '{{host.company_name}}' },
  { label: 'Company Email', value: '{{host.email}}' },
  { label: 'Company Phone', value: '{{host.phone}}' },
  { label: 'Company Website', value: '{{host.website}}' },
  { label: 'Email Signature', value: '{{host.signature}}' },
];

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TR']);

function extractText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/ /g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  if (el.tagName === 'BR') return '\n';
  const inner = Array.from(el.childNodes).map(extractText).join('');
  return BLOCK_TAGS.has(el.tagName) ? inner + '\n\n' : inner;
}

function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return extractText(div).replace(/\n{3,}/g, '\n\n').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function resolvePlaceholders(text: string, lead: Lead, branding: Branding): string {
  const sig = branding.emailHeaderHtml ? htmlToPlainText(branding.emailHeaderHtml).replace(/\n/g, '<br>') : '';
  const eventDate = lead.eventDate
    ? format(new Date(lead.eventDate), 'EEEE, MMMM d, yyyy')
    : '';
  return text
    .replace(/\{\{client\.first_name\}\}/g, lead.firstName)
    .replace(/\{\{client\.full_name\}\}/g, `${lead.firstName} ${lead.lastName}`)
    .replace(/\{\{client\.email\}\}/g, lead.email)
    .replace(/\{\{client\.phone\}\}/g, lead.phone ?? '')
    .replace(/\{\{event\.date\}\}/g, eventDate)
    .replace(/\{\{event\.start_time\}\}/g, formatTime(lead.startTime))
    .replace(/\{\{event\.end_time\}\}/g, formatTime(lead.endTime))
    .replace(/\{\{event\.venue_name\}\}/g, lead.venueName ?? '')
    .replace(/\{\{event\.venue_address\}\}/g, lead.venueAddress ?? '')
    .replace(/\{\{event\.venue_city\}\}/g, lead.venueCity ?? '')
    .replace(/\{\{event\.venue_state\}\}/g, lead.venueState ?? '')
    .replace(/\{\{event\.venue_zip\}\}/g, lead.venuePostalCode ?? '')
    .replace(/\{\{event\.guest_count\}\}/g, lead.guestCount?.toString() ?? '')
    .replace(/\{\{host\.company_name\}\}/g, branding.companyName ?? '')
    .replace(/\{\{host\.email\}\}/g, branding.replyToEmail ?? '')
    .replace(/\{\{host\.phone\}\}/g, branding.supportPhone ?? '')
    .replace(/\{\{host\.website\}\}/g, branding.websiteUrl ?? '')
    .replace(/\{\{host\.signature\}\}/g, sig);
}

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
  const [emailBody, setEmailBody] = useState(`<p>Hi ${initial.firstName},</p><p>Thank you for your inquiry! I'd love to learn more about your event.</p><p><br/></p>`);
  const [editorKey, setEditorKey] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  const [messages, setMessages] = useState<LeadMessage[]>(initial.messages);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reply' | 'thread'>('details');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [branding, setBranding] = useState<Branding>({});
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'thread') threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab, messages]);

  useEffect(() => {
    fetch('/api/automation/email-templates').then(r => r.ok ? r.json() : []).then(setTemplates);
    fetch('/api/settings/branding').then(r => r.ok ? r.json() : {}).then(setBranding);
  }, []);

  function applyTemplate(id: string) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setEmailSubject(resolvePlaceholders(t.subject, lead, branding));
    setEmailBody(t.bodyHtml); // Keep merge tags in the editor; resolve at send time
    setEditorKey(k => k + 1); // Force editor remount so content visually updates
  }

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
    // Strip editor's span wrappers around merge tags, then resolve to actual values
    const stripped = emailBody.replace(/<span[^>]+data-tag="([^"]+)"[^>]*>[^<]*<\/span>/g, '$1');
    const resolvedHtml = resolvePlaceholders(stripped, lead, branding);
    const res = await fetch(`/api/leads/${lead.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: emailSubject, bodyHtml: resolvedHtml }),
    });
    setSending(false);
    if (res.ok) {
      setEmailSent(true);
      if (lead.status === 'NEW') setLead(l => ({ ...l, status: 'CONTACTED' }));
      await refreshMessages();
      setActiveTab('thread');
      setEmailBody(`<p>Hi ${lead.firstName},</p><p></p>`);
      setEditorKey(k => k + 1);
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
      router.push(`/events/${data.eventId}`);
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
                  <div className="whitespace-pre-wrap leading-relaxed">{decodeEntities(m.bodyText || m.subject)}</div>
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
            {templates.length > 0 && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <select
                  defaultValue=""
                  onChange={e => { applyTemplate(e.target.value); e.target.value = ''; }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
                >
                  <option value="" disabled>Load a template…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
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
              <EmailTemplateEditor
                key={editorKey}
                value={emailBody}
                onChange={setEmailBody}
                mergeTags={LEAD_MERGE_TAGS}
              />
            </div>
            <p className="text-xs text-gray-400">Replies from the client will go directly to your email address on file. Merge tags are resolved when sent.</p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Attachments sent as replies are not captured in this thread. The outgoing email instructs clients to CC your contact email if they need to share a file.</p>
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
