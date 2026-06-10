#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function w(p, c) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}
console.log('\n\ud83d\udd27 Adding event editing + automation rules...\n');

// ── 1. Event edit page ────────────────────────────────────────────────────────
w('src/app/(tenant)/events/[id]/edit/page.tsx', `'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const STATUSES = ['LEAD','QUOTED','BOOKED','IN_PROGRESS','COMPLETED','CANCELLED'];

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title:'', status:'LEAD', eventDate:'', startTime:'', endTime:'',
    venueName:'', venueAddress:'', venueCity:'', venueState:'', venuePostalCode:'',
    packageName:'', guestCount:'', internalNotes:'',
    firstName:'', lastName:'', email:'', phone:'',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/events/' + id + '/full').then(r => r.json()).then(d => {
      if (d.error) return;
      const ev = d.event; const cl = d.client;
      const toTime = (dt: string | null) => dt ? new Date(dt).toTimeString().slice(0,5) : '';
      const toDate = (dt: string) => new Date(dt).toISOString().slice(0,10);
      setForm({
        title: ev.title ?? '', status: ev.status ?? 'LEAD',
        eventDate: toDate(ev.eventDate), startTime: toTime(ev.startTime), endTime: toTime(ev.endTime),
        venueName: ev.venueName ?? '', venueAddress: ev.venueAddress ?? '',
        venueCity: ev.venueCity ?? '', venueState: ev.venueState ?? '',
        venuePostalCode: ev.venuePostalCode ?? '',
        packageName: ev.packageName ?? '', guestCount: ev.guestCount?.toString() ?? '',
        internalNotes: ev.internalNotes ?? '',
        firstName: cl.firstName ?? '', lastName: cl.lastName ?? '',
        email: cl.email ?? '', phone: cl.phone ?? '',
      });
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true); setError('');
    const res = await fetch('/api/events/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (res.ok) router.push('/events/' + id);
    else { setError(data.error ?? 'Save failed'); setSaving(false); }
  }

  const F = (k: string, label: string, type = 'text', placeholder = '') => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/></div>
  );

  if (loading) return <><TopBar title="Edit Event"/><div className="p-8 text-gray-400">Loading...</div></>;

  return (
    <>
      <TopBar title="Edit Event" />
      <div className="p-8 max-w-3xl space-y-6">
        <Link href={'/events/' + id} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Event</Link>
        <Card>
          <CardHeader><CardTitle>Client</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {F('firstName','First Name')} {F('lastName','Last Name')}
            {F('email','Email','email')} {F('phone','Phone','tel')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">{F('title','Event Name')}</div>
            {F('eventDate','Event Date','date')}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onChange={e => set('status',e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
              </Select>
            </div>
            {F('startTime','Start Time','time')} {F('endTime','End Time','time')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">{F('venueName','Venue Name')}</div>
            <div className="col-span-2">{F('venueAddress','Street Address')}</div>
            {F('venueCity','City')} {F('venueState','State')}
            {F('venuePostalCode','Zip Code')} <div/>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {F('packageName','Package')} {F('guestCount','Guest Count','number')}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <Textarea value={form.internalNotes} onChange={e => set('internalNotes',e.target.value)} className="resize-none h-24"/>
            </div>
          </CardContent>
        </Card>
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.push('/events/' + id)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </>
  );
}
`);

// ── 2. Event PATCH API ────────────────────────────────────────────────────────
w('src/app/api/events/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(event);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const { title, status, eventDate, startTime, endTime, venueName, venueAddress, venueCity, venueState, venuePostalCode, packageName, guestCount, internalNotes, firstName, lastName, email, phone } = body;
  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      title, status, eventDate: new Date(eventDate),
      startTime: startTime ? new Date(eventDate + 'T' + startTime) : null,
      endTime: endTime ? new Date(eventDate + 'T' + endTime) : null,
      venueName: venueName || null, venueAddress: venueAddress || null,
      venueCity: venueCity || null, venueState: venueState || null,
      venuePostalCode: venuePostalCode || null,
      packageName: packageName || null,
      guestCount: guestCount ? parseInt(guestCount) : null,
      internalNotes: internalNotes || null,
    },
  });
  if (email) {
    await prisma.client.update({ where: { id: event.clientId }, data: { firstName: firstName || undefined, lastName: lastName || undefined, email, phone: phone || null } });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
`);

// ── 3. Full event data route (for edit form) ──────────────────────────────────
w('src/app/api/events/[id]/full/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { client, ...ev } = event;
  return NextResponse.json({ event: ev, client });
}
`);

// ── 4. Event detail with Edit + Delete buttons ────────────────────────────────
w('src/app/(tenant)/events/[id]/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Package, ArrowLeft, ExternalLink, FileText, Receipt, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import DeleteEventButton from './DeleteEventButton';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };
const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }, contracts: { orderBy: { createdAt: 'desc' } } } });
  if (!event) notFound();
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL + '/portal/' + event.portalToken;
  return (
    <>
      <TopBar title={event.title} />
      <div className="p-8 space-y-6 max-w-5xl">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>
        <div className="flex items-start justify-between">
          <div><div className="flex items-center gap-3 mb-1"><h2 className="text-2xl font-bold">{event.title}</h2><Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge></div>
          <p className="text-gray-500">{event.client.firstName} {event.client.lastName} &bull; {event.client.email}</p></div>
          <div className="flex gap-2">
            <Link href={'/events/' + event.id + '/edit'}><Button variant="outline" size="sm"><Edit2 className="w-4 h-4 mr-1"/>Edit Event</Button></Link>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>Client Portal</Button></a>
            <Link href={'/invoices/new?eventId=' + event.id}><Button size="sm"><Receipt className="w-4 h-4 mr-1"/>Create Invoice</Button></Link>
            <DeleteEventButton eventId={event.id} hasInvoices={event.invoices.length > 0} hasContracts={event.contracts.length > 0} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4">
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' \u2013 ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Venue</p><p className="font-medium">{event.venueName}</p><p className="text-sm text-gray-500">{[event.venueAddress,event.venueCity,event.venueState,(event as any).venuePostalCode].filter(Boolean).join(', ')}</p></div></div>}
              {event.guestCount && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Guests</p><p className="font-medium">{event.guestCount}</p></div></div>}
              {event.packageName && <div className="flex items-start gap-2"><Package className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Package</p><p className="font-medium">{event.packageName}</p></div></div>}
              {event.internalNotes && <div className="col-span-2"><p className="text-xs text-gray-500 mb-1">Notes</p><p className="text-sm bg-gray-50 rounded-lg p-3">{event.internalNotes}</p></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold">{event.client.firstName} {event.client.lastName}</p>
              <p className="text-gray-600">{event.client.email}</p>
              {event.client.phone && <p className="text-gray-600">{event.client.phone}</p>}
              <Link href={'/clients/' + event.clientId} className="text-brand text-xs hover:underline block pt-1">Edit client details</Link>
              <div className="pt-2 border-t"><p className="text-xs text-gray-400 mb-1">Client Portal</p><a href={portalUrl} target="_blank" className="text-brand hover:underline text-xs break-all">{portalUrl}</a></div>
            </CardContent>
          </Card>
        </div>
        {event.invoices.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Invoices</CardTitle><Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline" size="sm">Add Invoice</Button></Link></div></CardHeader>
            <CardContent className="p-0">
              <table className="w-full"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>{event.invoices.map(inv => (<tr key={inv.id} className="border-b last:border-0"><td className="px-6 py-3 text-sm font-medium">{inv.invoiceNumber}</td><td className="px-6 py-3 text-sm">{fmt(inv.totalCents)}</td><td className="px-6 py-3 text-sm">{fmt(inv.balanceDueCents)}</td><td className="px-6 py-3"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td><td className="px-6 py-3 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm">View</Button></Link></td></tr>))}</tbody></table>
            </CardContent>
          </Card>
        )}
        {event.contracts.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Contracts</CardTitle><Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline" size="sm">Add Contract</Button></Link></div></CardHeader>
            <CardContent className="p-0">
              <table className="w-full"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>{event.contracts.map(c => (<tr key={c.id} className="border-b last:border-0"><td className="px-6 py-3 text-sm font-medium"><FileText className="inline w-4 h-4 mr-2 text-gray-400"/>{c.title}</td><td className="px-6 py-3"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td><td className="px-6 py-3 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm">View</Button></Link></td></tr>))}</tbody></table>
            </CardContent>
          </Card>
        )}
        {event.invoices.length === 0 && event.contracts.length === 0 && (
          <div className="flex gap-3">
            <Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline"><Receipt className="w-4 h-4 mr-2"/>Create Invoice</Button></Link>
            <Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline"><FileText className="w-4 h-4 mr-2"/>Create Contract</Button></Link>
          </div>
        )}
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/events/[id]/DeleteEventButton.tsx', `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function DeleteEventButton({ eventId, hasInvoices, hasContracts }: { eventId: string; hasInvoices: boolean; hasContracts: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const blocked = hasInvoices || hasContracts;
  const blockedReason = hasInvoices && hasContracts ? 'invoices and contracts' : hasInvoices ? 'invoices' : 'contracts';

  if (blocked) {
    return <Button variant="ghost" size="sm" className="text-gray-300 cursor-not-allowed" title={'Delete ' + blockedReason + ' first'} disabled><Trash2 className="w-4 h-4"/></Button>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">Delete this event?</span>
        <Button size="sm" variant="destructive" onClick={async () => { setDeleting(true); await fetch('/api/events/' + eventId, { method: 'DELETE' }); router.push('/events'); }} disabled={deleting}>{deleting ? '...' : 'Yes'}</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>No</Button>
      </div>
    );
  }

  return <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => setConfirming(true)}><Trash2 className="w-4 h-4"/></Button>;
}
`);

// ── 5. Automation page with create rule ───────────────────────────────────────
w('src/app/(tenant)/automation/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Zap, Mail, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const TRIGGERS: [string, string][] = [
  ['LEAD_CREATED','Lead Created'],['QUOTE_SENT','Quote Sent'],['BOOKING_CONFIRMED','Booking Confirmed'],
  ['CONTRACT_SENT','Contract Sent'],['CONTRACT_FULLY_EXECUTED','Contract Executed'],
  ['INVOICE_SENT','Invoice Sent'],['PAYMENT_RECEIVED','Payment Received'],
  ['EVENT_DATE_MINUS_14_DAYS','14 Days Before Event'],['EVENT_DATE_MINUS_7_DAYS','7 Days Before Event'],
  ['EVENT_DATE_MINUS_1_DAY','Day Before Event'],
  ['EVENT_DATE_PLUS_1_DAY','Day After Event'],['EVENT_DATE_PLUS_3_DAYS','3 Days After Event'],
  ['GALLERY_PUBLISHED','Gallery Published'],
];

export default function AutomationPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:'', trigger:'LEAD_CREATED', emailTemplateId:'', triggerOffsetHours:'0' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const [r, t] = await Promise.all([fetch('/api/automation/rules'), fetch('/api/contracts/templates')]);
    setRules(await r.json());
    const tdata = await t.json();
    // Get email templates separately
    const et = await fetch('/api/automation/email-templates');
    if (et.ok) setTemplates(await et.json());
  }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch('/api/automation/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, actionType: 'EMAIL', triggerOffsetHours: parseInt(form.triggerOffsetHours) || 0 }) });
    await load(); setShowModal(false); setSaving(false);
    setForm({ name:'', trigger:'LEAD_CREATED', emailTemplateId:'', triggerOffsetHours:'0' });
  }

  async function toggleActive(rule: any) {
    await fetch('/api/automation/rules/' + rule.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !rule.isActive }) });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return;
    await fetch('/api/automation/rules/' + id, { method: 'DELETE' });
    await load();
  }

  const triggerLabel = (t: string) => TRIGGERS.find(([v]) => v === t)?.[1] ?? t;

  return (
    <>
      <TopBar title="Automation" />
      <div className="p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-start gap-3 flex-1 mr-4">
            <Zap className="w-5 h-5 text-brand mt-0.5 flex-shrink-0"/>
            <div>
              <p className="font-semibold text-brand-dark">Email Automation</p>
              <p className="text-sm text-gray-600 mt-1">Rules trigger automated emails at key points in your client journey. Create email templates in <a href="/contracts/templates" className="text-brand underline">Settings \u2192 Templates</a> first.</p>
            </div>
          </div>
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-2"/>New Rule</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Rules ({rules.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="font-medium mb-1">No automation rules yet</p>
                <p className="text-sm mb-4">Create rules to automatically email clients at key moments</p>
                <Button onClick={() => setShowModal(true)}>Create First Rule</Button>
              </div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Rule</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email Template</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{r.name}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{triggerLabel(r.trigger)}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400"/>{r.emailTemplate?.name ?? <span className="text-red-500">No template</span>}</div></td>
                      <td className="px-6 py-4">
                        <button onClick={() => toggleActive(r)} className="flex items-center gap-1.5 text-sm">
                          {r.isActive ? <ToggleRight className="w-5 h-5 text-green-500"/> : <ToggleLeft className="w-5 h-5 text-gray-300"/>}
                          <Badge variant={r.isActive ? 'success' : 'default'}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => deleteRule(r.id)}><Trash2 className="w-4 h-4"/></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Automation Rule">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
            <Input value={form.name} onChange={e => set('name',e.target.value)} placeholder="e.g. New Lead Auto-Reply"/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Trigger *</label>
            <Select value={form.trigger} onChange={e => set('trigger',e.target.value)}>
              {TRIGGERS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </Select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Template *</label>
            <Select value={form.emailTemplateId} onChange={e => set('emailTemplateId',e.target.value)}>
              <option value="">— Select Template —</option>
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            {templates.length === 0 && <p className="text-xs text-amber-600 mt-1">\u26a0\ufe0f No email templates found. <a href="/automation/email-templates" className="underline">Create one first</a>.</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name.trim() || !form.emailTemplateId}>{saving ? 'Creating...' : 'Create Rule'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
`);

// ── 6. Automation API routes ──────────────────────────────────────────────────
w('src/app/api/automation/rules/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const rules = await prisma.automationRule.findMany({ where: { tenantId: session.tenantId }, include: { emailTemplate: { select: { id: true, name: true, subject: true } } }, orderBy: [{ trigger: 'asc' }, { sortOrder: 'asc' }] });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, trigger, emailTemplateId, actionType, triggerOffsetHours } = await req.json();
  if (!name || !trigger) return NextResponse.json({ error: 'Name and trigger required' }, { status: 400 });
  const rule = await prisma.automationRule.create({ data: { tenantId: session.tenantId, name, trigger, actionType: actionType || 'EMAIL', emailTemplateId: emailTemplateId || null, triggerOffsetHours: triggerOffsetHours || 0, isActive: true } });
  return NextResponse.json(rule, { status: 201 });
}
`);

w('src/app/api/automation/rules/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.automationRule.update({ where: { id: params.id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.automationRule.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
`);

w('src/app/api/automation/email-templates/route.ts', `import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const templates = await prisma.emailTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: 'asc' } });
  return NextResponse.json(templates);
}
`);

// ── 7. Email templates management page ───────────────────────────────────────
w('src/app/(tenant)/automation/email-templates/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Trash2, Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const MERGE_TAGS = ['{{client.first_name}}','{{client.full_name}}','{{client.email}}','{{event.title}}','{{event.date}}','{{event.venue_name}}','{{host.company_name}}','{{host.email}}','{{contract.link}}','{{invoice.total}}','{{invoice.balance_due}}'];

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name:'', subject:'', bodyHtml:'' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/automation/email-templates');
    setTemplates(await r.json());
  }

  function openCreate() { setEditing(null); setForm({ name:'', subject:'Hi {{client.first_name}}, ', bodyHtml:'' }); setShowModal(true); }
  function openEdit(t: any) { setEditing(t); setForm({ name: t.name, subject: t.subject, bodyHtml: t.bodyHtml }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? '/api/automation/email-templates/' + editing.id : '/api/automation/email-templates';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    await load(); setShowModal(false); setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch('/api/automation/email-templates/' + id, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <TopBar title="Email Templates" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/automation" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Automation</Link>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Template</Button>
        </div>
        {templates.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-400">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-medium mb-1">No email templates yet</p>
            <p className="text-sm mb-4">Create templates to use in automation rules</p>
            <Button onClick={openCreate}>Create First Template</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id}><CardContent className="flex items-center justify-between py-4">
                <div><p className="font-semibold">{t.name}</p><p className="text-sm text-gray-500">Subject: {t.subject}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4"/></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
        <Card>
          <CardHeader><CardTitle className="text-sm">Available Merge Tags</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-2">{MERGE_TAGS.map(tag => <code key={tag} className="bg-brand-surface text-brand text-xs px-2 py-1 rounded font-mono">{tag}</code>)}</div></CardContent>
        </Card>
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Email Template' : 'New Email Template'} className="max-w-2xl">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label><Input value={form.name} onChange={e => set('name',e.target.value)} placeholder="Lead Auto-Reply"/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject Line *</label><Input value={form.subject} onChange={e => set('subject',e.target.value)} placeholder="Thanks for reaching out, {{client.first_name}}!"/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Body (HTML or plain text) *</label>
            <textarea value={form.bodyHtml} onChange={e => set('bodyHtml',e.target.value)} className="w-full h-48 font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand resize-none" placeholder="<p>Hi {{client.first_name}},</p>&#10;<p>Thank you for your inquiry...</p>"/>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.subject.trim() || !form.bodyHtml.trim()}>{saving ? 'Saving...' : editing ? 'Update' : 'Create Template'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
`);

w('src/app/api/automation/email-templates/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const t = await prisma.emailTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: 'asc' } });
  return NextResponse.json(t);
}
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, subject, bodyHtml } = await req.json();
  if (!name || !subject || !bodyHtml) return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  const t = await prisma.emailTemplate.create({ data: { tenantId: session.tenantId, name, subject, bodyHtml } });
  return NextResponse.json(t, { status: 201 });
}
`);

w('src/app/api/automation/email-templates/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, subject, bodyHtml } = await req.json();
  const t = await prisma.emailTemplate.update({ where: { id: params.id }, data: { name, subject, bodyHtml } });
  return NextResponse.json(t);
}
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.emailTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
`);

// ── 8. Update Automation in Sidebar ──────────────────────────────────────────
const sidebarPath = path.join(ROOT, 'src/components/layout/Sidebar.tsx');
let sidebar = fs.readFileSync(sidebarPath, 'utf8');
if (!sidebar.includes('email-templates')) {
  sidebar = sidebar.replace(
    `{ href: '/automation', label: 'Automation', icon: Zap },`,
    `{ href: '/automation', label: 'Automation', icon: Zap },\n  { href: '/automation/email-templates', label: 'Email Templates', icon: Mail },`
  );
  fs.writeFileSync(sidebarPath, sidebar, 'utf8');
  process.stdout.write('  \u2713 Sidebar.tsx (added Email Templates link)\n');
}

console.log('\n\u2705 Done! Refresh your browser.\n');
console.log('New features:');
console.log('  Events \u2192 Edit Event button (top right of event detail)');
console.log('  Events \u2192 Delete Event button (disabled if has invoices/contracts)');
console.log('  Automation \u2192 Create rules with trigger + email template');
console.log('  Automation \u2192 Email Templates \u2192 Create/edit email templates');
console.log('  Settings \u2192 Packages \u2192 Now saves to database (after npm run db)');
