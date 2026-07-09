import { NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireSuperAdminSession();

  const now = new Date();
  const thirtyDaysAgo  = new Date(now.getTime() - 30  * 86400000);
  const ninetyDaysAgo  = new Date(now.getTime() - 90  * 86400000);
  const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    tenants,
    invoiceVolume,
    newThisMonth,
    newLastMonth,
    // Activity sets for "active this month"
    activeEventTenants,
    activeInvoiceTenants,
    activeQuoteTenants,
    // Activation funnel: per-tenant existence checks for recent cohort
    recentCohortEventTenants,
    recentCohortInvoiceTenants,
    recentCohortPaidTenants,
    // Feature adoption (unique tenants using each feature)
    tenantsWithQuotes,
    tenantsWithContracts,
    tenantsWithGalleries,
    tenantsWithAutomations,
    tenantsWithLeads,
    // Last login: get all active memberships with user lastLoginAt
    memberships,
  ] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        stripeSubscription: { select: { plan: true, status: true } },
        stripeConnect:      { select: { chargesEnabled: true, onboardingStatus: true } },
        branding:           { select: { companyName: true, logoUrl: true } },
        _count:             { select: { events: true, invoices: true, quotes: true } },
      },
    }),
    prisma.invoice.aggregate({ _sum: { amountPaidCents: true } }),
    prisma.tenant.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.tenant.count({ where: { createdAt: { gte: startLastMonth, lte: endLastMonth } } }),
    // Active last 30 days
    prisma.event.groupBy({ by: ['tenantId'], where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.invoice.groupBy({ by: ['tenantId'], where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.quote.groupBy({ by: ['tenantId'], where: { createdAt: { gte: thirtyDaysAgo } } }),
    // Activation funnel steps for 90-day cohort
    prisma.event.groupBy({ by: ['tenantId'] }),
    prisma.invoice.groupBy({ by: ['tenantId'], where: { status: { not: 'DRAFT' } } }),
    prisma.invoice.groupBy({ by: ['tenantId'], where: { amountPaidCents: { gt: 0 } } }),
    // Feature adoption
    prisma.quote.groupBy({ by: ['tenantId'] }),
    prisma.contract.groupBy({ by: ['tenantId'] }),
    prisma.gallery.groupBy({ by: ['tenantId'], where: { isPublished: true } }),
    prisma.automationRule.groupBy({ by: ['tenantId'], where: { isActive: true } }),
    prisma.leadSubmission.groupBy({ by: ['tenantId'] }),
    // Memberships with last login
    prisma.tenantMembership.findMany({
      where: { status: 'ACTIVE' },
      select: { tenantId: true, user: { select: { lastLoginAt: true } } },
    }),
  ]);

  // --- Build lookup sets ---
  const activeSet = new Set([
    ...activeEventTenants.map(r => r.tenantId),
    ...activeInvoiceTenants.map(r => r.tenantId),
    ...activeQuoteTenants.map(r => r.tenantId),
  ]);

  const hasEventSet     = new Set(recentCohortEventTenants.map(r => r.tenantId));
  const hasSentInvoice  = new Set(recentCohortInvoiceTenants.map(r => r.tenantId));
  const hasPaidInvoice  = new Set(recentCohortPaidTenants.map(r => r.tenantId));
  const hasQuoteSet     = new Set(tenantsWithQuotes.map(r => r.tenantId));
  const hasContractSet  = new Set(tenantsWithContracts.map(r => r.tenantId));
  const hasGallerySet   = new Set(tenantsWithGalleries.map(r => r.tenantId));
  const hasAutoSet      = new Set(tenantsWithAutomations.map(r => r.tenantId));
  const hasLeadSet      = new Set(tenantsWithLeads.map(r => r.tenantId));

  // Last login per tenant (most recent across all members)
  const lastLoginMap: Record<string, Date | null> = {};
  for (const m of memberships) {
    const ll = m.user.lastLoginAt;
    if (!ll) continue;
    if (!lastLoginMap[m.tenantId] || ll > lastLoginMap[m.tenantId]!) {
      lastLoginMap[m.tenantId] = ll;
    }
  }

  const totalTenants = tenants.length;

  // --- Activation funnel (tenants created in last 90 days) ---
  const cohort = tenants.filter(t => new Date(t.createdAt) >= ninetyDaysAgo);
  const cohortSize = cohort.length;
  const funnel = {
    cohortSize,
    createdEvent:       cohort.filter(t => hasEventSet.has(t.id)).length,
    sentInvoice:        cohort.filter(t => hasSentInvoice.has(t.id)).length,
    receivedPayment:    cohort.filter(t => hasPaidInvoice.has(t.id)).length,
    stripeConnected:    cohort.filter(t => t.stripeConnect?.chargesEnabled).length,
    customizedBranding: cohort.filter(t => !!(t.branding?.companyName || t.branding?.logoUrl)).length,
  };

  // --- Feature adoption (all tenants) ---
  const adoption = {
    quotes:      tenantsWithQuotes.length,
    contracts:   tenantsWithContracts.length,
    galleries:   tenantsWithGalleries.length,
    automations: tenantsWithAutomations.length,
    leads:       tenantsWithLeads.length,
    total:       totalTenants,
  };

  // --- At-risk: paying but inactive ---
  const atRisk = tenants
    .filter(t => {
      const isPaying = t.stripeSubscription?.status === 'ACTIVE' &&
        (t.stripeSubscription.plan === 'MONTHLY' || t.stripeSubscription.plan === 'ANNUAL');
      return isPaying && !activeSet.has(t.id);
    })
    .map(t => ({
      id: t.id,
      name: t.branding?.companyName ?? t.name,
      plan: t.stripeSubscription?.plan ?? 'FREE_TRIAL',
      lastLogin: lastLoginMap[t.id] ?? null,
      totalEvents: t._count.events,
    }));

  // --- Per-operator table ---
  const operators = tenants.map(t => ({
    id:             t.id,
    name:           t.branding?.companyName ?? t.name,
    slug:           t.slug,
    status:         t.status,
    plan:           t.stripeSubscription?.plan ?? 'FREE_TRIAL',
    subStatus:      t.stripeSubscription?.status ?? null,
    stripeEnabled:  t.stripeConnect?.chargesEnabled ?? false,
    totalEvents:    t._count.events,
    totalInvoices:  t._count.invoices,
    totalQuotes:    t._count.quotes,
    activeThisMonth: activeSet.has(t.id),
    lastLogin:      lastLoginMap[t.id] ?? null,
    joinedAt:       t.createdAt,
    usesQuotes:     hasQuoteSet.has(t.id),
    usesContracts:  hasContractSet.has(t.id),
    usesGalleries:  hasGallerySet.has(t.id),
    usesAutomations: hasAutoSet.has(t.id),
    usesLeads:      hasLeadSet.has(t.id),
  }));

  return NextResponse.json({
    kpi: {
      totalOperators:  totalTenants,
      activeThisMonth: activeSet.size,
      payingOperators: tenants.filter(t =>
        t.stripeSubscription?.status === 'ACTIVE' &&
        (t.stripeSubscription.plan === 'MONTHLY' || t.stripeSubscription.plan === 'ANNUAL')
      ).length,
      totalVolumeProcessed: invoiceVolume._sum.amountPaidCents ?? 0,
      newThisMonth,
      newLastMonth,
      stripeConnected: tenants.filter(t => t.stripeConnect?.chargesEnabled).length,
    },
    funnel,
    adoption,
    atRisk,
    operators,
  });
}
