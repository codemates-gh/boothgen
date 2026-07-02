export const dynamic = 'force-dynamic';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import PlatformSettings from './PlatformSettings';
import PaymentSettings from './PaymentSettings';
import EarlyAdopterCard from './EarlyAdopterCard';
import { OperatorsTable } from './OperatorsTable';
import PlatformEmailTemplates from './PlatformEmailTemplates';
import SuperAdminSignOut from './SuperAdminSignOut';
import EmailActivityLog from './EmailActivityLog';
import SuperAdminTabs from './SuperAdminTabs';

const VALID_TABS = ['overview', 'operators', 'payment', 'email-logs', 'email-templates', 'settings'] as const;
type Tab = typeof VALID_TABS[number];

const TENANT_BADGE: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  TRIAL: 'warning', ACTIVE: 'success', SUSPENDED: 'danger', CANCELLED: 'default',
};

export default async function SuperAdminPage({ searchParams }: { searchParams: { tab?: string } }) {
  await requireSuperAdminSession();
  const tab: Tab = (VALID_TABS as readonly string[]).includes(searchParams?.tab ?? '')
    ? searchParams.tab as Tab
    : 'overview';

  const [tenants, totalUsers, totalEvents, allSettings, failedCounts, failedTotal, proSubscriberCount] = await Promise.all([
    prisma.tenant.findMany({
      take: 100, orderBy: { createdAt: 'desc' },
      include: {
        stripeSubscription: { select: { plan: true, status: true } },
        stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } },
        _count: { select: { events: true } },
        branding: { select: { companyName: true } },
      },
    }).catch(e => { console.error('[super-admin] tenants query failed:', e); return []; }),
    prisma.user.count().catch(() => 0),
    prisma.event.count().catch(() => 0),
    prisma.systemSetting.findMany({
      where: { key: { in: ['message_retention_months', 'gallery_expire_days', 'gallery_delete_days', 'email_template_welcome', 'email_template_forgot_password', 'stripe_price_monthly_id', 'stripe_price_annual_id', 'price_display_monthly', 'price_display_annual', 'commission_percentage', 'support_email', 'chatbot_enabled', 'early_adopter_cap', 'terms_content', 'privacy_content'] } },
    }).catch(() => []),
    prisma.automationExecution.groupBy({ by: ['tenantId'], where: { status: 'FAILED' }, _count: { id: true } }).catch(() => []),
    prisma.automationExecution.count({ where: { status: 'FAILED' } }).catch(() => 0),
    prisma.stripeSubscription.count({ where: { plan: 'MONTHLY', status: 'ACTIVE' } }).catch(() => 0),
  ]);

  const failedMap = Object.fromEntries((failedCounts as any[]).map((f: any) => [f.tenantId, f._count.id]));
  const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));
  const ov = {
    total:     tenants.length,
    active:    tenants.filter(t => t.status === 'ACTIVE').length,
    trial:     tenants.filter(t => t.status === 'TRIAL').length,
    suspended: tenants.filter(t => t.status === 'SUSPENDED').length,
  };
  const recentOperators = tenants.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3 shrink-0">
        <Camera className="w-5 h-5 text-brand" />
        <span className="font-bold">Booth Genius</span>
        <span className="text-white/30 mx-2">|</span>
        <span className="text-sm text-white/70">Super Admin Console</span>
        <SuperAdminSignOut />
      </div>

      {/* Tab Bar */}
      <SuperAdminTabs active={tab} failedTotal={failedTotal} />

      {/* Tab Content */}
      <div className="flex-1 p-8 space-y-8">

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
              <p className="text-sm text-gray-500 mt-1">Platform-wide statistics and recent signups.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {([
                ['Total Operators', ov.total,     Users,         'text-brand'],
                ['Active',          ov.active,    TrendingUp,    'text-green-500'],
                ['Trial',           ov.trial,     Camera,        'text-yellow-500'],
                ['Suspended',       ov.suspended, AlertTriangle, 'text-red-500'],
              ] as const).map(([label, val, Icon, color]) => (
                <Card key={label}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-500">{label}</p>
                      <Icon className={'w-5 h-5 ' + color} />
                    </div>
                    <p className="text-3xl font-bold">{val}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalUsers}</p><p className="text-sm text-gray-500 mt-1">Total Users</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalEvents}</p><p className="text-sm text-gray-500 mt-1">Total Events</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{tenants.filter(t => t.stripeConnect?.chargesEnabled).length}</p><p className="text-sm text-gray-500 mt-1">Stripe Connected</p></CardContent></Card>
            </div>

            {/* Recent Operators */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">Recent Signups</p>
                  <p className="text-xs text-gray-400 mt-0.5">10 most recently joined operators</p>
                </div>
                <a href="?tab=operators" className="text-xs text-brand font-medium hover:underline">
                  View all →
                </a>
              </div>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Operator</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Slug</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOperators.map(op => (
                      <tr key={op.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {op.branding?.companyName ?? op.name}
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{op.slug}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {format(new Date(op.createdAt), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={TENANT_BADGE[op.status] ?? 'default'}>{op.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {op.stripeSubscription?.plan ?? 'FREE_TRIAL'}
                        </td>
                      </tr>
                    ))}
                    {recentOperators.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No operators yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Early Adopter Cap */}
            <EarlyAdopterCard
              initialCap={settingsMap.early_adopter_cap ?? '50'}
              proSubscriberCount={proSubscriberCount}
            />
          </>
        )}

        {/* OPERATORS */}
        {tab === 'operators' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Operators</h1>
              <p className="text-sm text-gray-500 mt-1">All registered operators — manage status, view events, and monitor email failures.</p>
            </div>
            <OperatorsTable operators={tenants} failedMap={failedMap} />
          </>
        )}

        {/* PAYMENT PROCESSING */}
        {tab === 'payment' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payment Processing</h1>
              <p className="text-sm text-gray-500 mt-1">Stripe billing configuration, display pricing, and platform commission rates.</p>
            </div>
            <PaymentSettings
              initial={{
                stripe_price_monthly_id: settingsMap.stripe_price_monthly_id ?? '',
                price_display_monthly:   settingsMap.price_display_monthly   ?? '',
                commission_percentage:   settingsMap.commission_percentage    ?? '1.5',
              }}
            />
          </>
        )}

        {/* EMAIL LOGS */}
        {tab === 'email-logs' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Logs</h1>
              <p className="text-sm text-gray-500 mt-1">Automation email delivery history across all operators.</p>
            </div>
            <EmailActivityLog initialFailedTotal={failedTotal} />
          </>
        )}

        {/* EMAIL TEMPLATES */}
        {tab === 'email-templates' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
              <p className="text-sm text-gray-500 mt-1">System-level transactional email templates sent to operators and their clients.</p>
            </div>
            <PlatformEmailTemplates
              initial={{
                email_template_welcome:         settingsMap.email_template_welcome         ?? '',
                email_template_forgot_password: settingsMap.email_template_forgot_password ?? '',
              }}
            />
          </>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500 mt-1">Platform configuration: data retention, support contact, chatbot, and legal pages.</p>
            </div>
            <PlatformSettings
              initial={{
                message_retention_months: settingsMap.message_retention_months ?? '12',
                gallery_expire_days:      settingsMap.gallery_expire_days      ?? '30',
                gallery_delete_days:      settingsMap.gallery_delete_days      ?? '30',
                support_email:            settingsMap.support_email            ?? '',
                chatbot_enabled:          settingsMap.chatbot_enabled !== 'false',
                terms_content:            settingsMap.terms_content            ?? '',
                privacy_content:          settingsMap.privacy_content          ?? '',
              }}
            />
          </>
        )}

      </div>
    </div>
  );
}
