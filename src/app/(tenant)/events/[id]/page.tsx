export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
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
      <div className="p-4 sm:p-8 space-y-6">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-3 mb-1"><h2 className="text-xl sm:text-2xl font-bold">{event.title}</h2><Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge></div>
          <p className="text-gray-500 text-sm">{event.client.firstName} {event.client.lastName} &bull; {event.client.email}</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href={'/events/' + event.id + '/edit'}><Button variant="outline" size="sm"><Edit2 className="w-4 h-4 mr-1"/>Edit Event</Button></Link>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>Client Portal</Button></a>
            <Link href={'/invoices/new?eventId=' + event.id}><Button size="sm"><Receipt className="w-4 h-4 mr-1"/>Create Invoice</Button></Link>
            <DeleteEventButton eventId={event.id} hasInvoices={event.invoices.length > 0} hasContracts={event.contracts.length > 0} />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-4">
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' – ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Venue</p><p className="font-medium">{event.venueName}</p><p className="text-sm text-gray-500">{[event.venueAddress,event.venueCity,event.venueState,(event as any).venuePostalCode].filter(Boolean).join(', ')}</p></div></div>}
              {event.guestCount && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Guests</p><p className="font-medium">{event.guestCount}</p></div></div>}
              {event.packageName && <div className="flex items-start gap-2"><Package className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Package</p><p className="font-medium">{event.packageName}</p></div></div>}
              {event.internalNotes && <div className="sm:col-span-2"><p className="text-xs text-gray-500 mb-1">Notes</p><p className="text-sm bg-gray-50 rounded-lg p-3">{event.internalNotes}</p></div>}
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>{event.invoices.map(inv => (<tr key={inv.id} className="border-b last:border-0"><td className="px-6 py-3 text-sm font-medium">{inv.invoiceNumber}</td><td className="px-6 py-3 text-sm">{fmt(inv.totalCents)}</td><td className="px-6 py-3 text-sm">{fmt(inv.balanceDueCents)}</td><td className="px-6 py-3"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td><td className="px-6 py-3 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm">View</Button></Link></td></tr>))}</tbody></table>
              </div>
            </CardContent>
          </Card>
        )}
        {event.contracts.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Contracts</CardTitle><Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline" size="sm">Add Contract</Button></Link></div></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>{event.contracts.map(c => (<tr key={c.id} className="border-b last:border-0"><td className="px-6 py-3 text-sm font-medium"><FileText className="inline w-4 h-4 mr-2 text-gray-400"/>{c.title}</td><td className="px-6 py-3"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td><td className="px-6 py-3 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm">View</Button></Link></td></tr>))}</tbody></table>
              </div>
            </CardContent>
          </Card>
        )}
        {event.invoices.length === 0 && event.contracts.length === 0 && (
          <div className="flex flex-wrap gap-3">
            <Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline"><Receipt className="w-4 h-4 mr-2"/>Create Invoice</Button></Link>
            <Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline"><FileText className="w-4 h-4 mr-2"/>Create Contract</Button></Link>
          </div>
        )}
      </div>
    </>
  );
}
