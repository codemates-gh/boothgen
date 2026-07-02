export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Package, ArrowLeft, ExternalLink, FileText, Receipt, Edit2, ClipboardList, Layers, PenLine, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import DeleteEventButton from './DeleteEventButton';
import CancelEventButton from './CancelEventButton';
import MarkCompleteButton from './MarkCompleteButton';
import CloseEventButton from './CloseEventButton';
import MarkAsLostButton from './MarkAsLostButton';
import ReinstateEventButton from './ReinstateEventButton';
import AssignEventButton from './AssignEventButton';
import EventNotes from './EventNotes';
import EventChecklist from './EventChecklist';
import EventMessagePanel from './EventMessagePanel';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', ARCHIVED:'default', CANCELLED:'danger', LOST:'default' };
const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };
const QC: Record<string,any> = { DRAFT:'default', SENT:'info', VIEWED:'info', ACCEPTED:'success', DECLINED:'danger', EXPIRED:'default' };

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const isAdmin = session.tenantRole === 'HOST_ADMIN';

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      tenantId: session.tenantId,
      // Team members can only access events assigned to them
      ...(isAdmin ? {} : { assignedToUserId: session.userId }),
    },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      invoices: {
        include: {
          lineItems: { orderBy: { sortOrder: 'asc' } },
          PaymentMilestone: { orderBy: { dueDate: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      },
      Quote: { orderBy: { createdAt: 'desc' } },
      contracts: { orderBy: { createdAt: 'desc' } },
      templateDesigns: { orderBy: { version: 'desc' }, take: 3 },
      leadSubmission: { select: { id: true } },
      gallery: { select: { _count: { select: { assets: true } } } },
    },
  });
  if (!event) notFound();

  // Fetch active members for the assignment dropdown (admins only)
  const members = isAdmin
    ? await prisma.tenantMembership.findMany({
        where: { tenantId: session.tenantId, status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: 'asc' } },
      })
    : [];
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL + '/portal/' + event.portalToken;

  // Payment totals for cancel refund options
  const allMilestones = event.invoices.flatMap(inv => (inv as any).PaymentMilestone ?? []);
  const paidMilestones = allMilestones.filter((m: any) => m.status === 'PAID');
  const depositPaidCents = paidMilestones[0]?.amountCents ?? 0;
  const totalPaidCents = paidMilestones.reduce((sum: number, m: any) => sum + m.amountCents, 0);
  return (
    <>
      <TopBar title={event.title} />
      <div className="p-4 sm:p-8 space-y-6">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>

        {/* Header — admin sees action buttons, team member sees read-only header */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold">{event.title}</h2>
              <Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge>
            </div>
            <p className="text-gray-500 text-sm">{event.client.firstName} {event.client.lastName} &bull; {event.client.email}</p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Link href={'/events/' + event.id + '/edit'}><Button variant="outline" size="sm"><Edit2 className="w-4 h-4 mr-1"/>Edit Event</Button></Link>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>Client Portal</Button></a>
              <a href="#messages"><Button variant="outline" size="sm"><MessageSquare className="w-4 h-4 mr-1"/>Messages</Button></a>
              {event.Quote.length > 0 ? (
                <>
                  <Link href={'/quotes/' + event.Quote[0].id}><Button size="sm"><ClipboardList className="w-4 h-4 mr-1"/>View Quote</Button></Link>
                  <Link href={'/quotes/new?eventId=' + event.id}><Button variant="outline" size="sm">+ New Quote</Button></Link>
                </>
              ) : (
                <Link href={'/quotes/new?eventId=' + event.id}><Button size="sm"><ClipboardList className="w-4 h-4 mr-1"/>Create Quote</Button></Link>
              )}
              <Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline" size="sm"><Receipt className="w-4 h-4 mr-1"/>Create Invoice</Button></Link>
              {(event.status === 'BOOKED' || event.status === 'IN_PROGRESS') && new Date(event.eventDate) < new Date() && (
                <MarkCompleteButton eventId={event.id} />
              )}
              {event.status === 'COMPLETED' && (
                <CloseEventButton
                  eventId={event.id}
                  hasPhotos={(event as any).gallery?._count?.assets > 0}
                />
              )}
              <MarkAsLostButton eventId={event.id} status={event.status} />
              <ReinstateEventButton eventId={event.id} status={event.status} />
              <CancelEventButton eventId={event.id} status={event.status} depositPaidCents={depositPaidCents} totalPaidCents={totalPaidCents} />
              <DeleteEventButton eventId={event.id} hasInvoices={event.invoices.length > 0} hasContracts={event.contracts.length > 0} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-4">
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' – ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Venue</p><p className="font-medium">{event.venueName}</p><p className="text-sm text-gray-500">{[event.venueAddress,event.venueCity,event.venueState,(event as any).venuePostalCode].filter(Boolean).join(', ')}</p></div></div>}
              {event.guestCount && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Guests</p><p className="font-medium">{event.guestCount}</p></div></div>}
              {event.packageName && <div className="flex items-start gap-2"><Package className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Package</p><p className="font-medium">{event.packageName}</p></div></div>}
              {(event as any).estimatedValueCents != null && <div className="flex items-start gap-2"><Receipt className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-500">Estimated Value</p><p className="font-medium">{fmt((event as any).estimatedValueCents)}</p></div></div>}
              {event.internalNotes && <div className="sm:col-span-2"><p className="text-xs text-gray-500 mb-1">Notes</p><p className="text-sm bg-gray-50 rounded-lg p-3">{event.internalNotes}</p></div>}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Client card — team members see view-only, no portal link */}
            <Card>
              <CardHeader><CardTitle>Client</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-semibold">{event.client.firstName} {event.client.lastName}</p>
                <p className="text-gray-600">{event.client.email}</p>
                {event.client.phone && <p className="text-gray-600">{event.client.phone}</p>}
                {isAdmin && (
                  <>
                    <Link href={'/clients/' + event.clientId} className="text-brand text-xs hover:underline block pt-1">Edit client details</Link>
                    <div className="pt-2 border-t"><p className="text-xs text-gray-400 mb-1">Client Portal</p><a href={portalUrl} target="_blank" className="text-brand hover:underline text-xs break-all">{portalUrl}</a></div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Assigned To — team member sees name only */}
            <Card>
              <CardHeader><CardTitle>Assigned To</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {isAdmin ? (
                  <AssignEventButton
                    eventId={event.id}
                    currentAssigneeId={event.assignedToUserId ?? null}
                    members={members.map(m => m.user)}
                  />
                ) : (
                  <p className="text-gray-600">{event.assignedTo?.name ?? '—'}</p>
                )}
                {event.assignedTo && (
                  <p className="text-xs text-gray-400">{event.assignedTo.email}</p>
                )}
                {isAdmin && !event.assignedTo && (
                  <p className="text-xs text-gray-400">Select a team member to assign this event.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quotes — admin only */}
        {isAdmin && event.Quote.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quotes</CardTitle>
                <Link href={'/quotes/new?eventId=' + event.id}><Button variant="outline" size="sm">+ New Quote</Button></Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Quote</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sent</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                  <tbody>
                    {event.Quote.map(q => (
                      <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium">{q.quoteNumber}</td>
                        <td className="px-6 py-3 text-sm">{fmt(q.totalCents)}</td>
                        <td className="px-6 py-3 text-sm text-gray-500">{q.sentAt ? format(q.sentAt, 'MMM d, yyyy') : <span className="text-gray-400">Not sent</span>}</td>
                        <td className="px-6 py-3"><Badge variant={QC[q.status]}>{q.status}</Badge></td>
                        <td className="px-6 py-3 text-right">
                          <Link href={'/quotes/' + q.id}><Button variant={q.status === 'SENT' || q.status === 'VIEWED' ? 'default' : 'ghost'} size="sm">View Quote</Button></Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices & Contracts — admin only */}
        {isAdmin && event.invoices.length > 0 && (
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
        {isAdmin && event.contracts.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Contracts</CardTitle><Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline" size="sm">Add Contract</Button></Link></div></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]"><thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>{event.contracts.map(c => (<tr key={c.id} className={`border-b last:border-0 ${c.status === 'CLIENT_SIGNED' ? 'bg-amber-50/60' : ''}`}><td className="px-6 py-3 text-sm font-medium"><FileText className="inline w-4 h-4 mr-2 text-gray-400"/>{c.title}</td><td className="px-6 py-3"><div className="flex items-center gap-2"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge>{c.status === 'CLIENT_SIGNED' && <PenLine className="w-3.5 h-3.5 text-amber-500" />}</div></td><td className="px-6 py-3 text-right"><Link href={'/contracts/' + c.id}><Button variant={c.status === 'CLIENT_SIGNED' ? 'default' : 'ghost'} size="sm">{c.status === 'CLIENT_SIGNED' ? 'Sign Now' : 'View'}</Button></Link></td></tr>))}</tbody></table>
              </div>
            </CardContent>
          </Card>
        )}
        {isAdmin && event.invoices.length === 0 && event.contracts.length === 0 && (
          <div className="flex flex-wrap gap-3">
            <Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline"><Receipt className="w-4 h-4 mr-2"/>Create Invoice</Button></Link>
            <Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline"><FileText className="w-4 h-4 mr-2"/>Create Contract</Button></Link>
          </div>
        )}

        {/* Template Designs — visible to all */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Layers className="w-4 h-4"/>Template Designs</CardTitle>
              <Link href={'/events/' + event.id + '/designs'}><Button variant="outline" size="sm">{isAdmin ? 'Manage Designs' : 'View Designs'}</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {event.templateDesigns.length === 0 ? (
              <p className="text-sm text-gray-500">No designs uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {event.templateDesigns.map(d => (
                  <div key={d.id} className="flex items-center gap-3 text-sm">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0"/>
                    <span className="font-medium">Version {d.version}</span>
                    <Badge variant={({ DRAFT: 'default', PENDING_APPROVAL: 'info', REVISION_REQUESTED: 'warning', APPROVED: 'success' } as Record<string,any>)[d.status]}>
                      {d.status.replace(/_/g, ' ')}
                    </Badge>
                    <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 hover:underline">View ↗</a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes — visible to all, editable by all */}
        <EventNotes eventId={event.id} />

        {/* Checklist — visible to all */}
        <EventChecklist eventId={event.id} />

        {/* Messages — admin only */}
        {isAdmin && (
          <div id="messages">
            <EventMessagePanel
              eventId={event.id}
              clientName={`${event.client.firstName} ${event.client.lastName}`}
              clientEmail={event.client.email}
            />
          </div>
        )}
      </div>
    </>
  );
}
