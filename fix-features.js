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
console.log('\n\ud83d\udd27 Adding missing features...\n');

// ── 1. New Event form with zip code ──────────────────────────────────────────
w('src/app/(tenant)/events/new/page.tsx', `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName:'', lastName:'', email:'', phone:'',
    title:'', eventDate:'', startTime:'', endTime:'',
    venueName:'', venueAddress:'', venueCity:'', venueState:'', venuePostalCode:'',
    packageName:'', guestCount:'', internalNotes:'', status:'LEAD',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) router.push('/events/' + data.id);
      else { setError(data.error ?? 'Failed to create event'); setLoading(false); }
    } catch { setError('Network error'); setLoading(false); }
  }

  const F = (k: string, label: string, type = 'text', placeholder = '', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );

  return (
    <>
      <TopBar title="New Event" />
      <div className="p-8 max-w-3xl">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Client Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {F('firstName','First Name','text','Jane',true)}
              {F('lastName','Last Name','text','Smith',true)}
              {F('email','Email','email','jane@example.com',true)}
              {F('phone','Phone','tel','(555) 123-4567')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2">{F('title','Event Name','text','Smith Wedding',true)}</div>
              {F('eventDate','Event Date','date','',true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="LEAD">Lead</option><option value="QUOTED">Quoted</option><option value="BOOKED">Booked</option>
                </Select>
              </div>
              {F('startTime','Start Time','time')}
              {F('endTime','End Time','time')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2">{F('venueName','Venue Name','text','The Grand Ballroom')}</div>
              <div className="col-span-2">{F('venueAddress','Street Address','text','123 Main St')}</div>
              {F('venueCity','City','text','Austin')}
              {F('venueState','State','text','TX')}
              {F('venuePostalCode','Zip Code','text','78701')}
              <div></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Package & Notes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {F('packageName','Package','text','Deluxe 4-Hour Package')}
              {F('guestCount','Guest Count','number','150')}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes visible only to your team..." />
              </div>
            </CardContent>
          </Card>
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Event'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}
`);

// ── 2. Updated events API with zip code ───────────────────────────────────────
w('src/app/api/events/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { firstName, lastName, email, phone, title, eventDate, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    packageName, guestCount, internalNotes, status } = body;
  if (!firstName || !lastName || !email || !title || !eventDate)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const client = await prisma.client.upsert({
    where: { tenantId_email: { tenantId: session.tenantId, email } },
    update: { firstName, lastName, phone: phone || null },
    create: { tenantId: session.tenantId, firstName, lastName, email, phone: phone || null },
  });
  const event = await prisma.event.create({
    data: {
      tenantId: session.tenantId, clientId: client.id,
      title, status: status || 'LEAD', eventDate: new Date(eventDate),
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
  return NextResponse.json(event, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
`);

// ── 3. Contract templates management page ─────────────────────────────────────
w('src/app/(tenant)/contracts/templates/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Star, FileText } from 'lucide-react';
import Link from 'next/link';

export default function ContractTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const DEFAULT_BODY = \`<h2>EVENT SERVICES AGREEMENT</h2>
<p>This Agreement is entered into between {{host.company_name}} ("Company") and {{client.full_name}} ("Client").</p>

<h3>1. Event Details</h3>
<p>Event: {{event.title}}<br/>Date: {{event.date}}<br/>Venue: {{event.venue_name}}</p>

<h3>2. Services</h3>
<p>Company agrees to provide photo booth services for the package: {{event.package_name}}.</p>

<h3>3. Payment</h3>
<p>Total: {{invoice.total}}<br/>Retainer due at signing: {{invoice.retainer_amount}}<br/>Balance due: {{invoice.balance_due}}</p>

<h3>4. Cancellation Policy</h3>
<p>Cancellations more than 30 days before the event date forfeit the retainer. Cancellations within 30 days are subject to 50% of the total contract value.</p>

<h3>5. Agreement</h3>
<p>By signing below, both parties agree to the terms outlined in this agreement.</p>\`;

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/contracts/templates');
    setTemplates(await res.json());
  }

  function openCreate() {
    setEditing(null); setName('Standard Event Agreement'); setBody(DEFAULT_BODY); setShowModal(true);
  }

  function openEdit(t: any) {
    setEditing(t); setName(t.name); setBody(t.bodyHtml); setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? '/api/contracts/templates/' + editing.id : '/api/contracts/templates';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, bodyHtml: body }) });
    if (res.ok) { await load(); setShowModal(false); }
    setSaving(false);
  }

  async function setDefault(id: string) {
    await fetch('/api/contracts/templates/' + id + '/default', { method: 'POST' });
    await load();
  }

  return (
    <>
      <TopBar title="Contract Templates" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/contracts" className="text-sm text-gray-500 hover:text-gray-700">\u2190 Contracts</Link>
            <p className="text-sm text-gray-500 mt-1">Use merge tags like <code className="bg-gray-100 px-1 rounded">{"{{client.full_name}}"}</code> to auto-fill contract details.</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Template</Button>
        </div>

        {templates.length === 0 ? (
          <Card><CardContent className="text-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
            <p className="font-medium mb-2">No templates yet</p>
            <p className="text-sm mb-4">Create a template to reuse across contracts</p>
            <Button onClick={openCreate}>Create First Template</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400"/>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{t.name}</p>
                        {t.isDefault && <span className="flex items-center gap-1 text-xs bg-brand-surface text-brand px-2 py-0.5 rounded-full font-medium"><Star className="w-3 h-3"/>Default</span>}
                      </div>
                      <p className="text-xs text-gray-400">Created {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!t.isDefault && <Button variant="outline" size="sm" onClick={() => setDefault(t.id)}>Set Default</Button>}
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm">Available Merge Tags</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono text-gray-600">
              {[['{{client.full_name}}','Client full name'],['{{client.first_name}}','Client first name'],['{{client.email}}','Client email'],['{{event.title}}','Event name'],['{{event.date}}','Event date'],['{{event.venue_name}}','Venue name'],['{{event.package_name}}','Package name'],['{{event.guest_count}}','Guest count'],['{{invoice.total}}','Invoice total'],['{{invoice.retainer_amount}}','Retainer amount'],['{{invoice.balance_due}}','Balance due'],['{{invoice.due_date}}','Due date'],['{{host.company_name}}','Your company name'],['{{host.email}}','Your email'],['{{host.phone}}','Your phone']].map(([tag, desc]) => (
                <div key={tag} className="flex items-center gap-2 py-1"><code className="bg-gray-100 px-1.5 py-0.5 rounded text-brand">{tag}</code><span className="text-gray-400">{desc}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Template'} className="max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Standard Event Agreement"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Body (HTML)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full h-80 font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand resize-none" placeholder="Enter contract HTML..."/>
            <p className="text-xs text-gray-400 mt-1">Use HTML for formatting. Merge tags like {"{{client.full_name}}"} will be replaced when sending.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name.trim() || !body.trim()}>{saving ? 'Saving...' : 'Save Template'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
`);

// ── 4. Contract templates API (POST + PATCH + set-default) ────────────────────
w('src/app/api/contracts/templates/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const templates = await prisma.contractTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, bodyHtml } = await req.json();
  if (!name || !bodyHtml) return NextResponse.json({ error: 'Name and body required' }, { status: 400 });
  const count = await prisma.contractTemplate.count({ where: { tenantId: session.tenantId } });
  const template = await prisma.contractTemplate.create({ data: { tenantId: session.tenantId, name, bodyHtml, isDefault: count === 0 } });
  return NextResponse.json(template, { status: 201 });
}
`);

w('src/app/api/contracts/templates/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, bodyHtml } = await req.json();
  const t = await prisma.contractTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.contractTemplate.update({ where: { id: params.id }, data: { name, bodyHtml } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const t = await prisma.contractTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.contractTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
`);

w('src/app/api/contracts/templates/[id]/default/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.contractTemplate.updateMany({ where: { tenantId: session.tenantId }, data: { isDefault: false } });
  await prisma.contractTemplate.update({ where: { id: params.id }, data: { isDefault: true } });
  return NextResponse.json({ success: true });
}
`);

// ── 5. Super admin with delete ────────────────────────────────────────────────
w('src/app/api/super-admin/tenants/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.tenant.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { status } = await req.json();
  const tenant = await prisma.tenant.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(tenant);
}
`);

// ── 6. Super admin page with delete button ────────────────────────────────────
w('src/app/(platform)/super-admin/page.tsx', `import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Camera, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import SuperAdminActions from './SuperAdminActions';

const SC: Record<string,any> = { TRIAL:'warning', ACTIVE:'success', SUSPENDED:'danger', CANCELLED:'default' };
const CS: Record<string,any> = { NOT_CONNECTED:'default', ONBOARDING_INITIATED:'info', ACTIVE:'success', RESTRICTED:'warning', DEAUTHORIZED:'danger' };

export default async function SuperAdminPage() {
  await requireSuperAdminSession();
  const [tenants, totalUsers, totalEvents] = await Promise.all([
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } }, branding: { select: { companyName: true } } } }),
    prisma.user.count(), prisma.event.count(),
  ]);
  const ov = { total: tenants.length, active: tenants.filter(t => t.status==='ACTIVE').length, trial: tenants.filter(t => t.status==='TRIAL').length, suspended: tenants.filter(t => t.status==='SUSPENDED').length };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/><span className="font-bold">Photo Booth CRM</span>
        <span className="text-white/30 mx-2">|</span><span className="text-sm text-white/70">Super Admin Console</span>
      </div>
      <div className="p-8 space-y-8">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {([['Total Hosts',ov.total,Users,'text-brand'],['Active',ov.active,TrendingUp,'text-green-500'],['Trial',ov.trial,Camera,'text-yellow-500'],['Suspended',ov.suspended,AlertTriangle,'text-red-500']] as any[]).map(([label,val,Icon,color]: any) => (
            <Card key={label}><CardContent className="pt-6"><div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{label}</p><Icon className={'w-5 h-5 ' + color}/></div><p className="text-3xl font-bold">{val}</p></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalUsers}</p><p className="text-sm text-gray-500 mt-1">Total Users</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalEvents}</p><p className="text-sm text-gray-500 mt-1">Total Events</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{tenants.filter(t=>t.stripeConnect?.chargesEnabled).length}</p><p className="text-sm text-gray-500 mt-1">Stripe Connected</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>All Hosts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Company</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stripe</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{t.branding?.companyName ?? t.name}</p><p className="text-xs text-gray-400">/{t.slug}</p></td>
                    <td className="px-6 py-4"><Badge variant={SC[t.status]}>{t.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.stripeSubscription?.plan ?? 'Trial'}</td>
                    <td className="px-6 py-4"><Badge variant={CS[t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED']} className="text-xs">{t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED'}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t._count.events}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(t.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4"><SuperAdminActions tenantId={t.id} tenantName={t.branding?.companyName ?? t.name} eventCount={t._count.events} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

w('src/app/(platform)/super-admin/SuperAdminActions.tsx', `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function SuperAdminActions({ tenantId, tenantName, eventCount }: { tenantId: string; tenantName: string; eventCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function deleteTenant() {
    setDeleting(true);
    await fetch('/api/super-admin/tenants/' + tenantId, { method: 'DELETE' });
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">Delete "{tenantName}"?{eventCount > 0 ? ' (' + eventCount + ' events will be deleted)' : ''}</span>
        <Button size="sm" variant="destructive" onClick={deleteTenant} disabled={deleting}>{deleting ? 'Deleting...' : 'Confirm'}</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
      <Trash2 className="w-4 h-4"/>
    </Button>
  );
}
`);

// ── 7. Settings > Packages page ───────────────────────────────────────────────
w('src/app/(tenant)/settings/packages/page.tsx', `'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team']];

type Pkg = { id: string; name: string; description: string; priceCents: number };

export default function PackagesPage() {
  const [packages, setPackages] = useState<Pkg[]>([
    { id: '1', name: '2-Hour Standard', description: 'Open air booth, 2 hours, unlimited prints', priceCents: 75000 },
    { id: '2', name: '4-Hour Deluxe', description: 'Open air booth, 4 hours, props, custom overlay', priceCents: 120000 },
    { id: '3', name: '6-Hour Premium', description: 'Enclosed booth, 6 hours, all features, attendant', priceCents: 175000 },
  ]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');

  function addPackage() {
    if (!name.trim() || !price) return;
    setPackages(p => [...p, { id: Date.now().toString(), name, description: desc, priceCents: Math.round(parseFloat(price) * 100) }]);
    setName(''); setDesc(''); setPrice('');
  }

  function remove(id: string) { setPackages(p => p.filter(x => x.id !== id)); }

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'packages' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <p className="text-sm text-gray-500">Define your packages here for quick reference when creating events and invoices.</p>
        <Card>
          <CardHeader><CardTitle>Your Packages</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {packages.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-semibold text-sm">{p.name} <span className="text-brand font-bold">{fmt(p.priceCents)}</span></p>{p.description && <p className="text-xs text-gray-500">{p.description}</p>}</div>
                <Button variant="ghost" size="icon" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></Button>
              </div>
            ))}
            <div className="border-t pt-4 grid grid-cols-3 gap-3">
              <Input placeholder="Package name" value={name} onChange={e => setName(e.target.value)}/>
              <Input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)}/>
              <Input type="number" placeholder="Price ($)" value={price} onChange={e => setPrice(e.target.value)}/>
              <div className="col-span-3"><Button onClick={addPackage} disabled={!name.trim() || !price} className="w-full"><Plus className="w-4 h-4 mr-2"/>Add Package</Button></div>
            </div>
            <p className="text-xs text-gray-400">Note: Packages are reference only for now. Full package management with database storage is coming in the next update.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contract Templates</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">Manage reusable contract templates with merge tags for client details, event info, and pricing.</p>
            <Link href="/contracts/templates"><Button variant="outline">Manage Contract Templates \u2192</Button></Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// ── Add venuePostalCode to schema ─────────────────────────────────────────────
const schemaPath = path.join(ROOT, 'prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');
if (!schema.includes('venuePostalCode')) {
  schema = schema.replace(
    '  venueState    String?',
    '  venueState    String?\n  venuePostalCode String?'
  );
  fs.writeFileSync(schemaPath, schema, 'utf8');
  process.stdout.write('  \u2713 prisma/schema.prisma (added venuePostalCode)\n');
}

console.log('\n\u2705 Done! Run these commands:\n');
console.log('  npm run db     (push venuePostalCode to database)');
console.log('  (server will auto-reload)\n');
console.log('New pages available:');
console.log('  /contracts/templates  \u2192 Create and edit contract templates');
console.log('  /settings/packages    \u2192 Define your packages');
console.log('  /super-admin          \u2192 Delete button on each host row');
