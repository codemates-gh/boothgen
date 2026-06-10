#!/usr/bin/env node
/**
 * fix-remaining-pages.js
 * Fixes all remaining pages still importing from @clerk/nextjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function w(p, content) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}

console.log('\n\ud83d\udd27 Fixing remaining Clerk references...\n');

w('src/app/(tenant)/events/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function EventsPage() {
  const session = await requireTenantSession();
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' }, take: 100 });
  return (
    <>
      <TopBar title="Events" />
      <div className="p-8">
        <div className="flex justify-end mb-6"><Link href="/events/new"><Button><Plus className="w-4 h-4 mr-2"/>New Event</Button></Link></div>
        <Card><CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Calendar className="w-12 h-12 mx-auto mb-4 opacity-30"/><p className="text-lg font-medium mb-2">No events yet</p><Link href="/events/new"><Button className="mt-4">Create First Event</Button></Link></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Package</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold">{ev.title}</p><p className="text-xs text-gray-400">{ev.venueName ?? ''}</p></td>
                    <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{format(ev.eventDate,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{ev.packageName ?? '—'}</td>
                    <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
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

w('src/app/(tenant)/events/[id]/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Package, ArrowLeft, ExternalLink, FileText, Receipt } from 'lucide-react';
import { format } from 'date-fns';

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
          <div><div className="flex items-center gap-3 mb-1"><h2 className="text-2xl font-bold">{event.title}</h2><Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge></div><p className="text-gray-500">{event.client.firstName} {event.client.lastName} &bull; {event.client.email}</p></div>
          <div className="flex gap-2">
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>Client Portal</Button></a>
            <Link href={'/invoices/new?eventId=' + event.id}><Button size="sm"><Receipt className="w-4 h-4 mr-1"/>Create Invoice</Button></Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4">
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' \u2013 ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Venue</p><p className="font-medium">{event.venueName}</p></div></div>}
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
            <CardHeader><CardTitle>Contracts</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>{event.contracts.map(c => (<tr key={c.id} className="border-b last:border-0"><td className="px-6 py-3 text-sm font-medium"><FileText className="inline w-4 h-4 mr-2 text-gray-400"/>{c.title}</td><td className="px-6 py-3"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td><td className="px-6 py-3 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm">View</Button></Link></td></tr>))}</tbody></table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/clients/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Mail, Phone } from 'lucide-react';
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
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Added</th></tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold">{c.firstName} {c.lastName}</p>{c.company && <p className="text-xs text-gray-400">{c.company}</p>}</td>
                    <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1 text-gray-600"><Mail className="w-3 h-3"/>{c.email}</div>{c.phone && <div className="flex items-center gap-1 text-gray-500 mt-1"><Phone className="w-3 h-3"/>{c.phone}</div>}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c._count.events} event{c._count.events !== 1 ? 's' : ''}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
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

w('src/app/(tenant)/invoices/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export default async function InvoicesPage() {
  const session = await requireTenantSession();
  const invoices = await prisma.invoice.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Invoices" />
      <div className="p-8">
        <div className="flex justify-end mb-6"><Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-2"/>New Invoice</Button></Link></div>
        <Card><CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No invoices yet. <Link href="/invoices/new" className="text-brand hover:underline">Create one</Link></td></tr>}
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-4"><p className="font-semibold text-sm">{inv.invoiceNumber}</p>{inv.event && <p className="text-xs text-gray-400">{inv.event.title}</p>}</td>
                  <td className="px-6 py-4 text-sm">{inv.client.firstName} {inv.client.lastName}</td>
                  <td className="px-6 py-4 text-sm font-medium">{fmt(inv.totalCents)}</td>
                  <td className="px-6 py-4 text-sm">{fmt(inv.balanceDueCents)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{inv.dueDate ? format(inv.dueDate,'MMM d') : '—'}</td>
                  <td className="px-6 py-4"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td>
                  <td className="px-6 py-4 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/invoices/[id]/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } } });
  if (!inv) notFound();
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  return (
    <>
      <TopBar title={'Invoice ' + inv.invoiceNumber} />
      <div className="p-8 max-w-4xl space-y-6">
        <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Invoices</Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{inv.invoiceNumber}</h2><Badge variant={IC[inv.status]}>{inv.status}</Badge></div>
          {inv.status === 'DRAFT' && <form action={'/api/invoices/' + inv.id + '/send'} method="POST"><Button>Send to Client</Button></form>}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Card><CardContent className="pt-6 text-sm"><p className="font-bold text-base mb-1">{tenant?.branding?.companyName ?? tenant?.name}</p>{tenant?.branding?.replyToEmail && <p className="text-gray-600">{tenant.branding.replyToEmail}</p>}</CardContent></Card>
          <Card><CardContent className="pt-6 text-sm"><p className="font-semibold text-xs text-gray-400 uppercase mb-1">Bill To</p><p className="font-bold">{inv.client.firstName} {inv.client.lastName}</p><p className="text-gray-600">{inv.client.email}</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Unit</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
              <tbody>{inv.lineItems.map(li => (<tr key={li.id} className="border-b last:border-0"><td className="px-6 py-3">{li.description}</td><td className="px-6 py-3 text-right">{li.quantity}</td><td className="px-6 py-3 text-right">{fmt(li.unitCents)}</td><td className="px-6 py-3 text-right font-medium">{fmt(li.totalCents)}</td></tr>))}</tbody>
            </table>
            <div className="px-6 py-4 border-t text-right space-y-1 text-sm">
              <p className="text-gray-500">Subtotal: {fmt(inv.subtotalCents)}</p>
              {inv.taxAmountCents > 0 && <p className="text-gray-500">Tax: {fmt(inv.taxAmountCents)}</p>}
              <p className="text-xl font-bold">Total: {fmt(inv.totalCents)}</p>
              <p className="text-gray-500">Paid: {fmt(inv.amountPaidCents)}</p>
              <p className={'font-bold ' + (inv.balanceDueCents > 0 ? 'text-brand' : 'text-green-600')}>Balance Due: {fmt(inv.balanceDueCents)}</p>
              {inv.dueDate && <p className="text-gray-400 text-xs">Due {format(inv.dueDate,'MMMM d, yyyy')}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/contracts/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';

const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function ContractsPage() {
  const session = await requireTenantSession();
  const contracts = await prisma.contract.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Contracts" />
      <div className="p-8 space-y-6">
        <div className="flex justify-end"><Link href="/contracts/new"><Button>New Contract</Button></Link></div>
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

w('src/app/(tenant)/automation/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Mail } from 'lucide-react';

const triggerLabel: Record<string,string> = { LEAD_CREATED:'Lead Created', BOOKING_CONFIRMED:'Booking Confirmed', EVENT_DATE_MINUS_14_DAYS:'14 Days Before Event', EVENT_DATE_MINUS_7_DAYS:'7 Days Before Event', EVENT_DATE_MINUS_1_DAY:'Day Before Event', EVENT_DATE_PLUS_1_DAY:'Day After Event', EVENT_DATE_PLUS_3_DAYS:'3 Days After Event', INVOICE_SENT:'Invoice Sent', PAYMENT_RECEIVED:'Payment Received', CONTRACT_SENT:'Contract Sent', CONTRACT_FULLY_EXECUTED:'Contract Executed', GALLERY_PUBLISHED:'Gallery Published' };

export default async function AutomationPage() {
  const session = await requireTenantSession();
  const rules = await prisma.automationRule.findMany({ where: { tenantId: session.tenantId }, include: { emailTemplate: { select: { name: true } } }, orderBy: [{ trigger: 'asc' }, { sortOrder: 'asc' }] });
  return (
    <>
      <TopBar title="Automation" />
      <div className="p-8 space-y-6">
        <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-brand mt-0.5"/><div><p className="font-semibold text-brand-dark">Email Automation</p><p className="text-sm text-gray-600 mt-1">Rules trigger automated emails at key points in your client journey.</p></div>
        </div>
        <Card>
          <CardHeader><CardTitle>Active Rules ({rules.filter(r => r.isActive).length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><Zap className="w-10 h-10 mx-auto mb-3 opacity-30"/><p>No automation rules yet.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Rule</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Template</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{r.name}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{triggerLabel[r.trigger] ?? r.trigger}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400"/>{r.emailTemplate?.name ?? '—'}</div></td>
                      <td className="px-6 py-4"><Badge variant={r.isActive ? 'success' : 'default'}>{r.isActive ? 'Active' : 'Paused'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/gallery/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';

const GC: Record<string,any> = { PENDING_UPLOAD:'default', PENDING_REVIEW:'info', APPROVED:'success', CHANGES_REQUESTED:'warning' };

export default async function GalleryPage() {
  const session = await requireTenantSession();
  const galleries = await prisma.gallery.findMany({ where: { tenantId: session.tenantId }, include: { event: { select: { title: true, eventDate: true } }, _count: { select: { assets: true } } }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <TopBar title="Gallery" />
      <div className="p-8">
        <Card><CardContent className="p-0">
          {galleries.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Gallery folders are created automatically when you create an event.</p></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Gallery</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Approval</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Published</th></tr></thead>
              <tbody>{galleries.map(g => (<tr key={g.id} className="border-b last:border-0"><td className="px-6 py-4"><p className="font-medium text-sm">{g.title}</p><p className="text-xs text-gray-400">{g.event.title} &bull; {format(g.event.eventDate,'MMM d, yyyy')}</p></td><td className="px-6 py-4 text-sm">{g._count.assets}</td><td className="px-6 py-4"><Badge variant={GC[g.approvalStatus]}>{g.approvalStatus.replace(/_/g,' ')}</Badge></td><td className="px-6 py-4"><Badge variant={g.isPublished ? 'success' : 'default'}>{g.isPublished ? 'Published' : 'Draft'}</Badge></td></tr>))}</tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/settings/branding/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];

export default function BrandingSettingsPage() {
  const [form, setForm] = useState({ companyName:'', primaryColor:'#F97316', secondaryColor:'#EA6100', replyToEmail:'', supportPhone:'', websiteUrl:'', invoiceFooterText:'' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  useEffect(() => { fetch('/api/settings/branding').then(r => r.json()).then(d => { if (d && !d.error) setForm(p => ({ ...p, ...d })); }); }, []);
  async function save() {
    setSaving(true);
    await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'branding' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle>Company Branding</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label><Input value={form.companyName} onChange={e => set('companyName',e.target.value)} placeholder="Pixel Perfect Photo Booths"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label><div className="flex gap-2"><input type="color" value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label><div className="flex gap-2"><input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reply-to Email</label><Input type="email" value={form.replyToEmail} onChange={e => set('replyToEmail',e.target.value)} placeholder="hello@yourdomain.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label><Input value={form.supportPhone} onChange={e => set('supportPhone',e.target.value)} placeholder="(555) 123-4567"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label><Input value={form.websiteUrl} onChange={e => set('websiteUrl',e.target.value)} placeholder="https://yourbusiness.com"/></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer</label><Textarea value={form.invoiceFooterText} onChange={e => set('invoiceFooterText',e.target.value)} placeholder="Thank you for your business!"/></div>
            <div className="col-span-2 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : saved ? '\u2713 Saved' : 'Save Changes'}</Button></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/settings/billing/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];

export default async function BillingSettingsPage() {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeSubscription: true, stripeConnect: true } });
  const sub = tenant?.stripeSubscription;
  const conn = tenant?.stripeConnect;
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'billing' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5"/>Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><div><p className="font-semibold">{sub?.plan ?? 'Free Trial'}</p><p className="text-sm text-gray-500">{sub ? 'Status: ' + sub.status : 'Trial — upgrade to accept payments'}</p></div><Badge variant={sub?.status === 'ACTIVE' ? 'success' : 'warning'}>{sub?.status ?? 'TRIALING'}</Badge></div>
            {!sub && <Button>Upgrade to Pro</Button>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5"/>Stripe Connect</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {conn?.onboardingStatus === 'ACTIVE' ? (
              <div className="flex items-center gap-3 text-green-700 bg-green-50 rounded-xl p-4"><CheckCircle2 className="w-5 h-5"/><div><p className="font-semibold">Connected</p><p className="text-sm">Charges: {conn.chargesEnabled ? 'Enabled' : 'Pending'}</p></div></div>
            ) : conn ? (
              <div className="flex items-center gap-3 text-yellow-700 bg-yellow-50 rounded-xl p-4"><AlertCircle className="w-5 h-5"/><div><p className="font-semibold">Onboarding Incomplete</p><p className="text-sm">Finish your Stripe account setup to accept payments.</p></div></div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">Connect Stripe to accept credit card payments from clients.</p>
            )}
            <a href="/api/stripe/connect/authorize"><Button variant={conn?.onboardingStatus === 'ACTIVE' ? 'outline' : 'default'}>{conn ? 'Update Stripe' : 'Connect Stripe Account'}</Button></a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/settings/team/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { format } from 'date-fns';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];
const RC: Record<string,any> = { HOST_ADMIN:'brand', TEAM_MEMBER:'default' };
const SC: Record<string,any> = { ACTIVE:'success', INVITED:'info', SUSPENDED:'danger' };

export default async function TeamSettingsPage() {
  const session = await requireTenantSession();
  const members = await prisma.tenantMembership.findMany({ where: { tenantId: session.tenantId }, include: { user: { select: { name: true, email: true } } }, orderBy: { joinedAt: 'desc' } });
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'team' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Team Members ({members.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-6 py-4"><p className="font-medium text-sm">{m.user.name}</p><p className="text-xs text-gray-400">{m.user.email}</p></td>
                    <td className="px-6 py-4"><Badge variant={RC[m.role]}>{m.role.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4"><Badge variant={SC[m.status]}>{m.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{m.joinedAt ? format(m.joinedAt,'MMM d, yyyy') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// Scan for any remaining Clerk imports
const { execSync } = require('child_process');
try {
  const remaining = execSync('grep -r "@clerk/nextjs" src/ --include="*.tsx" --include="*.ts" -l 2>/dev/null || echo ""', { cwd: ROOT }).toString().trim();
  if (remaining) {
    console.log('\n\u26a0\ufe0f  Still has Clerk imports:');
    remaining.split('\n').filter(Boolean).forEach(f => console.log('    ' + f));
  } else {
    console.log('\n\u2705 All Clerk imports removed!');
  }
} catch(e) {}

console.log('\n\u2705 All pages updated. Refresh your browser.\n');
