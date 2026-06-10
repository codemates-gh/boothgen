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
console.log('\n\ud83d\udd27 Fixing navigation, clients, packages...\n');

// ── 1. Add ServicePackage to schema ───────────────────────────────────────────
const schemaPath = path.join(ROOT, 'prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');
if (!schema.includes('ServicePackage')) {
  // Add to Tenant model
  schema = schema.replace(
    '  auditLogs            AuditLog[]',
    '  auditLogs            AuditLog[]\n  servicePackages      ServicePackage[]'
  );
  // Add model at end
  schema += `
model ServicePackage {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  description String?
  priceCents  Int      @default(0)
  category    String   @default("package")
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId])
  @@map("service_packages")
}
`;
  fs.writeFileSync(schemaPath, schema, 'utf8');
  process.stdout.write('  \u2713 prisma/schema.prisma (added ServicePackage)\n');
}

// ── 2. Packages API ───────────────────────────────────────────────────────────
w('src/app/api/settings/packages/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const pkgs = await prisma.servicePackage.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  return NextResponse.json(pkgs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, description, priceCents, category } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const pkg = await prisma.servicePackage.create({ data: { tenantId: session.tenantId, name, description: description || null, priceCents: priceCents || 0, category: category || 'package' } });
  return NextResponse.json(pkg, { status: 201 });
}
`);

w('src/app/api/settings/packages/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const pkg = await prisma.servicePackage.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.servicePackage.update({ where: { id: params.id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pkg = await prisma.servicePackage.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.servicePackage.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
`);

// ── 3. Packages settings page (full with DB + a la carte) ─────────────────────
w('src/app/(tenant)/settings/packages/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';
import { Plus, Edit2, Trash2, Package, Layers } from 'lucide-react';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team']];
const CATS = [['package','Full Package'],['addon','Add-On / Extra'],['product','A La Carte Item'],['discount','Discount']];
const CAT_COLOR: Record<string,string> = { package:'bg-brand-surface text-brand', addon:'bg-blue-50 text-blue-700', product:'bg-purple-50 text-purple-700', discount:'bg-green-50 text-green-700' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

type Pkg = { id: string; name: string; description: string | null; priceCents: number; category: string; isActive: boolean };

export default function PackagesPage() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [form, setForm] = useState({ name:'', description:'', price:'', category:'package' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/settings/packages');
    setPkgs(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ name:'', description:'', price:'', category:'package' });
    setShowModal(true);
  }

  function openEdit(p: Pkg) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? '', price: (p.priceCents/100).toFixed(2), category: p.category });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const body = { name: form.name, description: form.description || null, priceCents: Math.round(parseFloat(form.price||'0')*100), category: form.category };
    if (editing) {
      await fetch('/api/settings/packages/' + editing.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/settings/packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    await load(); setShowModal(false); setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    await fetch('/api/settings/packages/' + id, { method: 'DELETE' });
    await load();
  }

  const grouped = CATS.map(([key, label]) => ({ key, label, items: pkgs.filter(p => p.category === key) })).filter(g => g.items.length > 0);

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4 flex-wrap">
          {TABS.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'packages' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Define packages, add-ons, and a la carte items. These appear as quick-add options when building invoices.</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>Add Item</Button>
        </div>

        {pkgs.length === 0 && (
          <Card><CardContent className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-medium mb-1">No packages or products yet</p>
            <p className="text-sm mb-4">Add full packages, add-ons, and a la carte items</p>
            <Button onClick={openCreate}>Add First Item</Button>
          </CardContent></Card>
        )}

        {grouped.map(({ key, label, items }) => (
          <Card key={key}>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="w-4 h-4"/>{label}s</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase"><th className="text-left px-6 py-3">Name</th><th className="text-left px-6 py-3">Description</th><th className="text-right px-6 py-3">Price</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3"><p className="font-medium text-sm">{p.name}</p><span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (CAT_COLOR[p.category] ?? 'bg-gray-100 text-gray-600')}>{CATS.find(c=>c[0]===p.category)?.[1] ?? p.category}</span></td>
                      <td className="px-6 py-3 text-sm text-gray-500">{p.description ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-semibold text-sm">{fmt(p.priceCents)}</td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-3 h-3"/></Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader><CardTitle className="text-sm">Contract Templates</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-600 mb-3">Create reusable contract templates with merge tags.</p>
          <Link href="/contracts/templates"><Button variant="outline">Manage Contract Templates \u2192</Button></Link></CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Item' : 'Add Item'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <Select value={form.category} onChange={e => set('category', e.target.value)}>
              {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 4-Hour Deluxe Package"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="What's included..."/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price ($) *</label>
            <Input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)} placeholder="1200.00"/>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.price}>{saving ? 'Saving...' : editing ? 'Update' : 'Add Item'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
`);

// ── 4. Contracts page with Templates button ────────────────────────────────────
w('src/app/(tenant)/contracts/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Settings } from 'lucide-react';
import { format } from 'date-fns';

const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function ContractsPage() {
  const session = await requireTenantSession();
  const [contracts, templateCount] = await Promise.all([
    prisma.contract.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.contractTemplate.count({ where: { tenantId: session.tenantId } }),
  ]);
  return (
    <>
      <TopBar title="Contracts" />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/contracts/new"><Button>New Contract</Button></Link>
            <Link href="/contracts/templates">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2"/>
                Templates {templateCount > 0 ? '(' + templateCount + ')' : '(0 — set up first)'}
              </Button>
            </Link>
          </div>
          {templateCount === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm text-yellow-800">
              \u26a0\ufe0f  No templates yet. <Link href="/contracts/templates" className="font-semibold underline">Create one</Link> before creating contracts.
            </div>
          )}
        </div>
        <Card><CardContent className="p-0">
          {contracts.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>No contracts yet.</p></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{c.title}</p>{c.event && <p className="text-xs text-gray-400">{c.event.title}</p>}</td>
                    <td className="px-6 py-4 text-sm">{c.client.firstName} {c.client.lastName}</td>
                    <td className="px-6 py-4"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
`);

// ── 5. Settings navigation update (all settings pages) ────────────────────────
const SETTINGS_TABS = `[['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team']]`;
const settingsPages = ['branding', 'billing', 'team'];
settingsPages.forEach(page => {
  const fp = path.join(ROOT, 'src/app/(tenant)/settings/' + page + '/page.tsx');
  if (fs.existsSync(fp)) {
    let content = fs.readFileSync(fp, 'utf8');
    content = content.replace(
      /const tabs = \[.*?\];/,
      'const tabs = ' + SETTINGS_TABS + ';'
    );
    fs.writeFileSync(fp, content, 'utf8');
    process.stdout.write('  \u2713 settings/' + page + '/page.tsx (added Packages tab)\n');
  }
});

// ── 6. Clients list with edit/delete links ─────────────────────────────────────
w('src/app/(tenant)/clients/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Mail, Phone, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default async function ClientsPage() {
  const session = await requireTenantSession();
  const clients = await prisma.client.findMany({ where: { tenantId: session.tenantId }, include: { _count: { select: { events: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Clients" />
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
          <Link href="/events/new"><Button>Add Client + Event</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Users className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Clients appear here when you create events or receive inquiries.</p></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Added</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold">{c.firstName} {c.lastName}</p>{c.company && <p className="text-xs text-gray-400">{c.company}</p>}</td>
                    <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1 text-gray-600"><Mail className="w-3 h-3"/>{c.email}</div>{c.phone && <div className="flex items-center gap-1 text-gray-500 mt-1"><Phone className="w-3 h-3"/>{c.phone}</div>}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c._count.events} event{c._count.events !== 1 ? 's' : ''}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-right"><Link href={'/clients/' + c.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
`);

// ── 7. Client detail/edit page ─────────────────────────────────────────────────
w('src/app/(tenant)/clients/[id]/page.tsx', `'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Trash2, Calendar, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', company:'', addressLine1:'', city:'', state:'', postalCode:'', notes:'' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/clients/' + id).then(r => r.json()).then(d => {
      setClient(d.client); setEvents(d.events ?? []);
      setForm({ firstName: d.client.firstName ?? '', lastName: d.client.lastName ?? '', email: d.client.email ?? '', phone: d.client.phone ?? '', company: d.client.company ?? '', addressLine1: d.client.addressLine1 ?? '', city: d.client.city ?? '', state: d.client.state ?? '', postalCode: d.client.postalCode ?? '', notes: d.client.notes ?? '' });
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true);
    await fetch('/api/clients/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function deleteClient() {
    setDeleting(true);
    await fetch('/api/clients/' + id, { method: 'DELETE' });
    router.push('/clients');
  }

  if (loading) return <><TopBar title="Client"/><div className="p-8 text-gray-400">Loading...</div></>;
  if (!client) return <><TopBar title="Client"/><div className="p-8 text-gray-400">Client not found.</div></>;

  const F = (k: string, label: string, type = 'text', placeholder = '') => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/></div>
  );

  return (
    <>
      <TopBar title={client.firstName + ' ' + client.lastName} />
      <div className="p-8 max-w-3xl space-y-6">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Clients</Link>

        <Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>Client Details</CardTitle>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1"/>{saving ? 'Saving...' : 'Save'}</Button>
              {!confirmDelete
                ? <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4 mr-1"/>Delete</Button>
                : <div className="flex items-center gap-2"><span className="text-xs text-red-600 font-medium">Are you sure?</span><Button variant="destructive" size="sm" onClick={deleteClient} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, Delete'}</Button><Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button></div>
              }
            </div>
          </div></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {F('firstName','First Name','text','Jane')}
            {F('lastName','Last Name','text','Smith')}
            {F('email','Email','email','jane@example.com')}
            {F('phone','Phone','tel','(555) 123-4567')}
            {F('company','Company / Organization')}
            <div className="col-span-2">{F('addressLine1','Address')}</div>
            {F('city','City')}
            {F('state','State')}
            {F('postalCode','Zip Code')}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this client..." className="resize-none h-24"/>
            </div>
          </CardContent>
        </Card>

        {events.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4"/>Events ({events.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {events.map((ev: any) => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-sm">{ev.title}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{format(new Date(ev.eventDate),'MMM d, yyyy')}</td>
                      <td className="px-6 py-3"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                      <td className="px-6 py-3 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
`);

// ── 8. Client API ─────────────────────────────────────────────────────────────
w('src/app/api/clients/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const events = await prisma.event.findMany({ where: { clientId: client.id, tenantId: session.tenantId }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json({ client, events });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.client.update({ where: { id: params.id }, data: { firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone || null, company: body.company || null, addressLine1: body.addressLine1 || null, city: body.city || null, state: body.state || null, postalCode: body.postalCode || null, notes: body.notes || null } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const eventCount = await prisma.event.count({ where: { clientId: client.id } });
  if (eventCount > 0) return NextResponse.json({ error: 'Cannot delete client with ' + eventCount + ' event(s). Delete the events first.' }, { status: 400 });
  await prisma.client.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
`);

console.log('\n\u2705 Done! Run:\n');
console.log('  npm run db   (adds ServicePackage table)');
console.log('\nNew features:');
console.log('  /clients/[id]           \u2192 Edit/delete clients, view their events');
console.log('  /settings/packages      \u2192 Full a la carte + package management (saved to DB)');
console.log('  /contracts              \u2192 Templates button now visible');
console.log('  /contracts/templates    \u2192 Create/edit templates');
console.log('  /settings/branding|billing|team \u2192 Now shows Packages tab');
