export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { fmtCents } from '@/lib/utils';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Package, ArrowLeft, ExternalLink, FileText, Receipt, Edit2, ClipboardList, Layers, PenLine, Send, Sparkles, Mail, Phone, Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import AssignEventButton from './AssignEventButton';
import CopyLinkButton from './CopyLinkButton';
import { EventActionsMenu, BannerStateActions, type EventActionProps } from './EventActions';
import EventNotes from './EventNotes';
import EventChecklist from './EventChecklist';
import EventMessagePanel from './EventMessagePanel';
import EventProfitability from './EventProfitability';
import EventInvoicePanel from './EventInvoicePanel';
import { DOC_HEAD, DOC_ROW, DOC_WIDE, DOC_NARROW } from './docGrid';
import EventAutomations, { type EventAutomationRow } from './EventAutomations';
import { settleZeroInvoice } from '@/lib/invoices/payments';
import { clientDisplayName } from '@/lib/clientName';


const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', ARCHIVED:'default', CANCELLED:'danger', LOST:'default' };
const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };
const QC: Record<string,any> = { DRAFT:'default', SENT:'info', VIEWED:'info', ACCEPTED:'success', DECLINED:'danger', EXPIRED:'default' };

export default async function EventDetailPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ followup?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
          // The latest payment marked by hand (no Stripe ids), for full-payment invoices
          payments: { where: { stripeChargeId: null, stripePaymentIntentId: null }, orderBy: { paidAt: 'desc' }, take: 1 },
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
  // A sent $0 invoice counts as paid
  for (const inv of event.invoices) {
    if (await settleZeroInvoice(prisma, inv.id)) Object.assign(inv, { status: 'PAID', paidAt: new Date(), balanceDueCents: 0, amountPaidCents: 0 });
  }

  // Fetch active members for the assignment dropdown (admins only)
  const members = isAdmin
    ? await prisma.tenantMembership.findMany({
        where: { tenantId: session.tenantId, status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: 'asc' } },
      })
    : [];
  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId }, select: { currency: true } });
  const genieEnabled = isAdmin && !!(await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { genieEnabled: true } }))?.genieEnabled;
  const fmt = (c: number) => fmtCents(c, branding?.currency ?? 'usd');

  // Automated emails for this event, and the ones that start once it's booked (admins)
  const BOOKED_TRIGGERS: Record<string, string> = {
    BOOKING_CONFIRMED: 'on booking', EVENT_DATE_MINUS_14_DAYS: '14 days before', EVENT_DATE_MINUS_7_DAYS: '7 days before',
    EVENT_DATE_MINUS_1_DAY: 'the day before', EVENT_DATE_PLUS_1_DAY: 'the day after', EVENT_DATE_PLUS_3_DAYS: '3 days after',
  };
  const [executions, bookingRules] = isAdmin ? await Promise.all([
    prisma.automationExecution.findMany({
      where: { eventId: params.id, tenantId: session.tenantId },
      include: { rule: { select: { name: true, emailTemplate: { select: { name: true } } } } },
      orderBy: { scheduledFor: 'asc' },
    }),
    ['LEAD', 'QUOTED'].includes(event.status)
      ? prisma.automationRule.findMany({ where: { tenantId: session.tenantId, isActive: true, trigger: { in: Object.keys(BOOKED_TRIGGERS) as any } }, select: { id: true, name: true, trigger: true } })
      : Promise.resolve([]),
  ]) : [[], []];
  const automationRows: EventAutomationRow[] = executions.map(x => ({
    id: x.id, name: x.rule.name, template: x.rule.emailTemplate?.name ?? null, status: x.status,
    scheduledFor: x.scheduledFor.toISOString(), executedAt: x.executedAt?.toISOString() ?? null,
    skippedHere: x.status === 'SKIPPED' && x.errorMessage === 'Skipped from the event page',
  }));
  const onceBooked = bookingRules.filter(r => !executions.some(x => x.ruleId === r.id)).map(r => `${r.name} (${BOOKED_TRIGGERS[r.trigger]})`);
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL + '/portal/' + event.portalToken;

  // Payment totals for cancel refund options
  const allMilestones = event.invoices.flatMap(inv => (inv as any).PaymentMilestone ?? []);
  const paidMilestones = allMilestones.filter((m: any) => m.status === 'PAID');
  const depositPaidCents = paidMilestones[0]?.amountCents ?? 0;
  const totalPaidCents = paidMilestones.reduce((sum: number, m: any) => sum + m.amountCents, 0);

  // Follow-up context
  const firstQuote = event.Quote[0];
  const hasOpenQuote = event.Quote.some(q => ['SENT', 'VIEWED'].includes(q.status));
  const showFollowUp = isAdmin && event.status === 'QUOTED' && hasOpenQuote;
  const openQuote = event.Quote.find(q => ['SENT', 'VIEWED'].includes(q.status));
  const draftQuote = event.Quote.find(q => q.status === 'DRAFT');
  const hasAcceptedQuote = event.Quote.some(q => q.status === 'ACCEPTED');
  const isFollowUp = searchParams?.followup === '1';
  const actionProps: EventActionProps = {
    eventId: event.id, status: event.status, isPast: new Date(event.eventDate) < new Date(),
    hasPhotos: ((event as any).gallery?._count?.assets ?? 0) > 0,
    hasInvoices: event.invoices.length > 0, hasContracts: event.contracts.length > 0,
    depositPaidCents, totalPaidCents, currency: branding?.currency ?? 'usd',
  };
  // Workflow banner: the next step for a lead or an open quote; hidden once a quote is accepted or the event is booked
  const banner = !isAdmin || hasAcceptedQuote ? null
    : event.status === 'LEAD' ? (
        draftQuote
          ? { text: `Next step: quote ${draftQuote.quoteNumber} is a draft. Review it and send it to the client.`, href: '/quotes/' + draftQuote.id, label: 'Open Quote', icon: 'quote' as const }
          : { text: 'Initial step: start this event with a quote.', href: '/quotes/new?eventId=' + event.id, label: 'New Quote', icon: 'new' as const }
      )
    : showFollowUp && openQuote ? { text: `Waiting on the client to accept quote ${openQuote.quoteNumber}${openQuote.sentAt ? ', sent ' + format(openQuote.sentAt, 'MMM d') : ''}.`, href: `/events/${event.id}?followup=1#messages`, label: 'Send Follow-Up', icon: 'follow' as const }
    : null;
  // Financials & Documents: each kind in its own outlined box with a shaded title bar
  const box = 'rounded-lg border border-gray-200 overflow-hidden';
  const boxHead = 'flex items-center gap-2 bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#1F1F3D]';
  const count = (n: number) => <span className="ml-1 rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">{n}</span>;
  const venueLine = [event.venueAddress, event.venueCity, event.venueState, (event as any).venuePostalCode].filter(Boolean).join(', ');
  const followUpSubject = isFollowUp ? `Following up on your quote — ${event.title}` : undefined;
  return (
    <>
      <TopBar title={event.title} />
      <div className="p-4 sm:p-8 space-y-6">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>

        {/* Header: title, status and client on the left; one row of utility buttons on the right (admins) */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold">{event.title}</h2>
              <Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge>
            </div>
            <p className="text-gray-500 text-sm">{[`${event.client.firstName} ${event.client.lastName}`, (event.client as any).company].filter(Boolean).join(' · ')} &bull; {format(event.eventDate, 'MMM d, yyyy')}</p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:flex-shrink-0">
              <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1.5"/>Client Portal</Button></a>
              {genieEnabled && <Link href={'/events/' + event.id + '/genie'}><Button variant="outline" size="sm"><Sparkles className="w-3.5 h-3.5 mr-1.5"/>Genie</Button></Link>}
              <Link href={'/events/' + event.id + '/edit'}><Button variant="outline" size="sm"><Edit2 className="w-3.5 h-3.5 mr-1.5"/>Edit Event</Button></Link>
              <EventActionsMenu {...actionProps} />
            </div>
          )}
        </div>

        {/* Event overview: logistics, client, assigned to */}
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            <div className="p-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Event</p>
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' – ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="font-medium">{event.venueName}</p>{venueLine && <p className="text-sm text-gray-500">{venueLine}</p>}</div></div>}
              {event.guestCount && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><p className="font-medium">{event.guestCount} guests</p></div>}
              {event.packageName && <div className="flex items-start gap-2"><Package className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><p className="font-medium">{event.packageName}</p></div>}
              {(event as any).estimatedValueCents != null && <div className="flex items-start gap-2"><Receipt className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="font-medium">{fmt((event as any).estimatedValueCents)}</p><p className="text-xs text-gray-500">Estimated value</p></div></div>}
            </div>

            <div className="p-6 space-y-3 text-sm min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Client</p>
              <div>
                {isAdmin
                  ? <Link href={'/clients/' + event.clientId} className="font-semibold text-[#1F1F3D] hover:underline">{event.client.firstName} {event.client.lastName}</Link>
                  : <p className="font-semibold">{event.client.firstName} {event.client.lastName}</p>}
                {(event.client as any).company && <p className="text-gray-500">{(event.client as any).company}</p>}
              </div>
              <a href={'mailto:' + event.client.email} className="flex items-center gap-2 text-gray-600 hover:text-[#1F1F3D] min-w-0"><Mail className="w-4 h-4 text-gray-400 flex-shrink-0"/><span className="truncate">{event.client.email}</span></a>
              {event.client.phone && <a href={'tel:' + event.client.phone} className="flex items-center gap-2 text-gray-600 hover:text-[#1F1F3D]"><Phone className="w-4 h-4 text-gray-400 flex-shrink-0"/>{event.client.phone}</a>}
              {isAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-gray-200 text-xs font-semibold text-[#1F1F3D] hover:bg-[#F5F6F8]"><ExternalLink className="w-3.5 h-3.5"/>Open Client Portal</a>
                  <CopyLinkButton url={portalUrl} label="Copy client portal link" />
                </div>
              )}
            </div>

            <div className="p-6 space-y-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Assigned To</p>
              {isAdmin ? (
                <AssignEventButton eventId={event.id} currentAssigneeId={event.assignedToUserId ?? null} members={members.map(m => m.user)} />
              ) : (
                <p className="font-medium">{event.assignedTo?.name ?? '—'}</p>
              )}
              {event.assignedTo && <p className="text-xs text-gray-400">{event.assignedTo.email}</p>}
              {isAdmin && (
                <p className="text-xs text-gray-400">{event.assignedTo ? '' : 'Pick who runs this event. '}Log their pay under <a href="#profitability" className="font-medium text-gray-600 hover:underline">Profitability</a> as Operator Pay.</p>
              )}
            </div>
          </div>
          {event.internalNotes && (
            <div className="border-t border-gray-100 px-6 py-4">
              <p className="text-xs text-gray-500 mb-1">Event notes</p>
              <p className="text-sm whitespace-pre-line">{event.internalNotes}</p>
            </div>
          )}
        </Card>

        {/* Workflow banner: the next step, based on where the event is */}
        {banner && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#784BD1]/20 bg-[#784BD1]/5 px-5 py-3">
            <p className="flex-1 text-sm font-medium text-[#4A2F86]">{banner.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={banner.href}>
                <Button size="sm" className="bg-[#784BD1] hover:bg-[#6A3FC0]">
                  {banner.icon === 'new' ? <Plus className="w-3.5 h-3.5 mr-1.5"/> : banner.icon === 'follow' ? <Send className="w-3.5 h-3.5 mr-1.5"/> : <ClipboardList className="w-3.5 h-3.5 mr-1.5"/>}{banner.label}
                </Button>
              </Link>
              <BannerStateActions {...actionProps} />
            </div>
          </div>
        )}

        {/* Financials & documents: quotes, contracts, invoices (admins) */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <CardTitle>Financials &amp; Documents</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Link href={'/quotes/new?eventId=' + event.id}><Button variant="outline" size="sm"><Plus className="w-3.5 h-3.5 mr-1"/>New Quote</Button></Link>
                  <Link href={'/contracts/new?eventId=' + event.id}><Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1.5"/>Create Contract</Button></Link>
                  <Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline" size="sm"><Receipt className="w-3.5 h-3.5 mr-1.5"/>Create Invoice</Button></Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {event.Quote.length + event.contracts.length + event.invoices.length === 0 && (
                <p className="text-sm text-gray-500">No quotes, contracts or invoices yet.</p>
              )}

              {event.Quote.length > 0 && (
                <div className={box}>
                  <div className={boxHead}><ClipboardList className="w-4 h-4 text-gray-400"/>Quotes{count(event.Quote.length)}</div>
                  <div className={DOC_HEAD}><span>Quote</span><span className={DOC_WIDE}>Total</span><span className={DOC_WIDE}>Sent</span><span>Status</span><span/></div>
                  {event.Quote.map(q => (
                    <Link key={q.id} href={'/quotes/' + q.id} className={DOC_ROW + ' border-b border-gray-100 last:border-0'}>
                      <span className="font-medium min-w-0">
                        <span className="block truncate">{q.quoteNumber}</span>
                        <span className={DOC_NARROW}>{fmt(q.totalCents)} · {q.sentAt ? 'Sent ' + format(q.sentAt, 'MMM d, yyyy') : 'Not sent'}</span>
                      </span>
                      <span className={DOC_WIDE}>{fmt(q.totalCents)}</span>
                      <span className={DOC_WIDE + ' text-gray-500'}>{q.sentAt ? format(q.sentAt, 'MMM d, yyyy') : <span className="text-gray-400">Not sent</span>}</span>
                      <span><Badge variant={QC[q.status]}>{q.status}</Badge></span>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand transition-colors"/>
                    </Link>
                  ))}
                </div>
              )}

              {event.contracts.length > 0 && (
                <div className={box}>
                  <div className={boxHead}><FileText className="w-4 h-4 text-gray-400"/>Contracts{count(event.contracts.length)}</div>
                  <div className={DOC_HEAD}><span className="sm:col-span-3">Title</span><span>Status</span><span/></div>
                  {event.contracts.map(c => (
                    <Link key={c.id} href={'/contracts/' + c.id} className={DOC_ROW + ' border-b border-gray-100 last:border-0' + (c.status === 'CLIENT_SIGNED' ? ' bg-amber-50/60' : '')}>
                      <span className="sm:col-span-3 font-medium flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-gray-400 flex-shrink-0"/><span className="truncate">{c.title}</span></span>
                      <span className="flex items-center gap-2">
                        <Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge>
                        {c.status === 'CLIENT_SIGNED' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><PenLine className="w-3.5 h-3.5"/>Sign now</span>}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand transition-colors"/>
                    </Link>
                  ))}
                </div>
              )}

              {event.invoices.length > 0 && (
                <div className={box}>
                  <div className={boxHead}><Receipt className="w-4 h-4 text-gray-400"/>Invoices{count(event.invoices.length)}</div>
                  <div className={DOC_HEAD}><span>Invoice</span><span className={DOC_WIDE}>Total</span><span className={DOC_WIDE}>Balance</span><span>Status</span><span/></div>
                  <EventInvoicePanel
                    invoices={event.invoices.map(inv => ({
                      id: inv.id,
                      invoiceNumber: inv.invoiceNumber,
                      totalCents: inv.totalCents,
                      balanceDueCents: inv.balanceDueCents,
                      status: inv.status,
                      currency: (inv as any).currency ?? branding?.currency ?? 'usd',
                      fullPayment: ((inv as any).PaymentMilestone ?? []).length === 0 ? {
                        dueDate: (inv.dueDate ?? inv.createdAt).toISOString(),
                        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
                        paymentMethod: (inv as any).payments?.[0]?.paymentMethod ?? null,
                        viaStripe: inv.status === 'PAID' && !(inv as any).payments?.length,
                      } : null,
                      milestones: ((inv as any).PaymentMilestone ?? []).map((m: any) => ({
                        id: m.id,
                        label: m.label,
                        amountCents: m.amountCents,
                        dueDate: m.dueDate instanceof Date ? m.dueDate.toISOString() : m.dueDate,
                        status: m.status,
                        paidAt: m.paidAt instanceof Date ? m.paidAt.toISOString() : (m.paidAt ?? null),
                        paymentMethod: m.paymentMethod ?? null,
                      })),
                    }))}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prep: template designs and checklist side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
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

          <EventChecklist eventId={event.id} />
        </div>

        {/* Notes — visible to all, editable by all */}
        <EventNotes eventId={event.id} />

        {/* Automated emails for this event — admin only */}
        {isAdmin && <EventAutomations eventId={event.id} rows={automationRows} onceBooked={onceBooked} />}

        {/* Messages — admin only */}
        {isAdmin && (
          <div id="messages" className="scroll-mt-20">
            <EventMessagePanel
              eventId={event.id}
              clientName={`${event.client.firstName} ${event.client.lastName}`}
              clientEmail={event.client.email}
              firstName={event.client.firstName}
              eventDateStr={format(event.eventDate, 'EEEE, MMMM d, yyyy')}
              venueName={event.venueName ?? undefined}
              quoteTotal={firstQuote ? fmt(firstQuote.totalCents) : undefined}
              portalUrl={portalUrl}
              defaultSubject={followUpSubject}
            />
          </div>
        )}

        {/* Profitability (admin) / Print Log (team member) */}
        <div id="profitability" className="scroll-mt-20">
          <EventProfitability
            eventId={event.id}
            isAdmin={isAdmin}
            revenueCents={totalPaidCents}
            currency={branding?.currency ?? 'usd'}
          />
        </div>
      </div>
    </>
  );
}
