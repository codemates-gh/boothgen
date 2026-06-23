export const dynamic = 'force-dynamic';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import PlatformSettings from './PlatformSettings';
import { OperatorsTable } from './OperatorsTable';
import PlatformEmailTemplates from './PlatformEmailTemplates';
import SuperAdminSignOut from './SuperAdminSignOut';

export default async function SuperAdminPage() {
  await requireSuperAdminSession();
  const [tenants, totalUsers, totalEvents, allSettings] = await Promise.all([
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } }, branding: { select: { companyName: true } } } }).catch(e => { console.error('[super-admin] tenants query failed:', e); return []; }),
    prisma.user.count().catch(() => 0),
    prisma.event.count().catch(() => 0),
    prisma.systemSetting.findMany({ where: { key: { in: ['message_retention_months', 'gallery_expire_days', 'gallery_delete_days', 'email_template_welcome', 'email_template_forgot_password', 'stripe_price_monthly_id', 'stripe_price_annual_id', 'price_display_monthly', 'price_display_annual', 'commission_percentage', 'support_email', 'chatbot_enabled'] } } }).catch(() => []),
  ]);
  const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));
  const ov = { total: tenants.length, active: tenants.filter(t => t.status==='ACTIVE').length, trial: tenants.filter(t => t.status==='TRIAL').length, suspended: tenants.filter(t => t.status==='SUSPENDED').length };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/><span className="font-bold">Booth Genius</span>
        <span className="text-white/30 mx-2">|</span><span className="text-sm text-white/70">Super Admin Console</span>
        <SuperAdminSignOut />
      </div>
      <div className="p-8 space-y-8">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <PlatformSettings initial={{ message_retention_months: settingsMap.message_retention_months ?? '12', gallery_expire_days: settingsMap.gallery_expire_days ?? '30', gallery_delete_days: settingsMap.gallery_delete_days ?? '30', stripe_price_monthly_id: settingsMap.stripe_price_monthly_id ?? '', stripe_price_annual_id: settingsMap.stripe_price_annual_id ?? '', price_display_monthly: settingsMap.price_display_monthly ?? '', price_display_annual: settingsMap.price_display_annual ?? '', commission_percentage: settingsMap.commission_percentage ?? '5', support_email: settingsMap.support_email ?? '', chatbot_enabled: settingsMap.chatbot_enabled !== 'false' }} />
        <PlatformEmailTemplates initial={{ email_template_welcome: settingsMap.email_template_welcome ?? '', email_template_forgot_password: settingsMap.email_template_forgot_password ?? '' }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {([['Total Operators',ov.total,Users,'text-brand'],['Active',ov.active,TrendingUp,'text-green-500'],['Trial',ov.trial,Camera,'text-yellow-500'],['Suspended',ov.suspended,AlertTriangle,'text-red-500']] as any[]).map(([label,val,Icon,color]: any) => (
            <Card key={label}><CardContent className="pt-6"><div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{label}</p><Icon className={'w-5 h-5 ' + color}/></div><p className="text-3xl font-bold">{val}</p></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalUsers}</p><p className="text-sm text-gray-500 mt-1">Total Users</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalEvents}</p><p className="text-sm text-gray-500 mt-1">Total Events</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{tenants.filter(t=>t.stripeConnect?.chargesEnabled).length}</p><p className="text-sm text-gray-500 mt-1">Stripe Connected</p></CardContent></Card>
        </div>
        <OperatorsTable operators={tenants} />
      </div>
    </div>
  );
}
