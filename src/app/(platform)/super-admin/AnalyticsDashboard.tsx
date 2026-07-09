'use client';
import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users, TrendingUp, DollarSign, Activity,
  UserCheck, AlertTriangle, BarChart2, Zap,
} from 'lucide-react';

type KPI = {
  totalOperators: number;
  activeThisMonth: number;
  payingOperators: number;
  totalVolumeProcessed: number;
  newThisMonth: number;
  newLastMonth: number;
  stripeConnected: number;
};

type Funnel = {
  cohortSize: number;
  createdEvent: number;
  sentInvoice: number;
  receivedPayment: number;
  stripeConnected: number;
  customizedBranding: number;
};

type Adoption = {
  quotes: number; contracts: number; galleries: number;
  automations: number; leads: number; total: number;
};

type AtRisk = { id: string; name: string; plan: string; lastLogin: string | null; totalEvents: number };

type OperatorRow = {
  id: string; name: string; slug: string; status: string; plan: string; subStatus: string | null;
  stripeEnabled: boolean; totalEvents: number; totalInvoices: number; totalQuotes: number;
  activeThisMonth: boolean; lastLogin: string | null; joinedAt: string;
  usesQuotes: boolean; usesContracts: boolean; usesGalleries: boolean;
  usesAutomations: boolean; usesLeads: boolean;
};

type Analytics = {
  kpi: KPI; funnel: Funnel; adoption: Adoption;
  atRisk: AtRisk[]; operators: OperatorRow[];
};

const PLAN_LABEL: Record<string, string> = {
  FREE_TRIAL: 'Commission', MONTHLY: 'Pro Monthly', ANNUAL: 'Pro Annual',
};

const PLAN_BADGE: Record<string, 'default' | 'warning' | 'success'> = {
  FREE_TRIAL: 'default', MONTHLY: 'success', ANNUAL: 'success',
};

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function fmtDollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">{value} <span className="text-gray-400 font-normal">/ {total} ({p}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: p + '%' }} />
      </div>
    </div>
  );
}

function AdoptionBar({ label, value, total }: { label: string; value: number; total: number }) {
  const p = pct(value, total);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#0085FF] rounded-full" style={{ width: p + '%' }} />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-16 text-right">{p}% <span className="text-gray-400 font-normal text-xs">({value})</span></span>
    </div>
  );
}

function LoginAge({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-400 text-xs">Never</span>;
  const d = new Date(date);
  const daysDiff = (Date.now() - d.getTime()) / 86400000;
  const color = daysDiff < 7 ? 'text-green-600' : daysDiff < 30 ? 'text-yellow-600' : 'text-red-500';
  return (
    <span className={`text-xs ${color}`} title={format(d, 'MMM d, yyyy h:mm a')}>
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<'lastLogin' | 'totalEvents' | 'joinedAt'>('lastLogin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/super-admin/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-24 text-gray-400">Loading analytics…</div>;
  if (!data) return <div className="text-center py-24 text-gray-400">Failed to load analytics.</div>;

  const { kpi, funnel, adoption, atRisk, operators } = data;

  const filtered = operators
    .filter(op => !search || op.name.toLowerCase().includes(search.toLowerCase()) || op.slug.includes(search.toLowerCase()))
    .sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'lastLogin')    { av = a.lastLogin ? new Date(a.lastLogin).getTime() : 0; bv = b.lastLogin ? new Date(b.lastLogin).getTime() : 0; }
      if (sortCol === 'totalEvents')  { av = a.totalEvents; bv = b.totalEvents; }
      if (sortCol === 'joinedAt')     { av = new Date(a.joinedAt).getTime(); bv = new Date(b.joinedAt).getTime(); }
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const SortBtn = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-gray-800 transition-colors group">
      {label}
      <span className="text-gray-300 group-hover:text-gray-500">{sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
    </button>
  );

  const growth = kpi.newLastMonth > 0
    ? Math.round(((kpi.newThisMonth - kpi.newLastMonth) / kpi.newLastMonth) * 100)
    : null;

  return (
    <div className="space-y-8">

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Operators',       value: kpi.totalOperators,   icon: Users,       sub: `${kpi.stripeConnected} Stripe connected`, color: 'text-[#0085FF]' },
          { label: 'Active This Month',     value: kpi.activeThisMonth,  icon: Activity,    sub: `${pct(kpi.activeThisMonth, kpi.totalOperators)}% of all operators`, color: 'text-green-500' },
          { label: 'Paying Operators',      value: kpi.payingOperators,  icon: UserCheck,   sub: `${pct(kpi.payingOperators, kpi.totalOperators)}% conversion rate`, color: 'text-purple-500' },
          { label: 'Volume Processed',      value: fmtDollars(kpi.totalVolumeProcessed), icon: DollarSign, sub: 'All-time invoice payments', color: 'text-emerald-500', raw: true },
        ].map(({ label, value, icon: Icon, sub, color, raw }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{raw ? value : value.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Growth + Funnel row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Growth */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-[#0085FF]" />Growth</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{kpi.newThisMonth}</p>
                <p className="text-xs text-gray-500 mt-0.5">New signups this month</p>
              </div>
              {growth !== null && (
                <div className={`text-sm font-semibold px-2 py-1 rounded-lg ${growth >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {growth >= 0 ? '+' : ''}{growth}% vs last month
                </div>
              )}
            </div>
            <div className="pt-2 border-t space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Last month</span><span className="font-medium">{kpi.newLastMonth}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Stripe connected</span><span className="font-medium">{kpi.stripeConnected}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Paying (paid plans)</span><span className="font-medium">{kpi.payingOperators}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Activation Funnel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart2 className="w-4 h-4 text-[#0085FF]" />
              Activation Funnel
              <span className="text-xs text-gray-400 font-normal ml-1">(all operators)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FunnelBar label="Created first event"    value={funnel.createdEvent}       total={funnel.cohortSize} color="bg-[#0085FF]" />
            <FunnelBar label="Sent first invoice"     value={funnel.sentInvoice}        total={funnel.cohortSize} color="bg-purple-500" />
            <FunnelBar label="Received first payment" value={funnel.receivedPayment}    total={funnel.cohortSize} color="bg-emerald-500" />
            <FunnelBar label="Connected Stripe"       value={funnel.stripeConnected}    total={funnel.cohortSize} color="bg-amber-400" />
            <FunnelBar label="Customized branding"    value={funnel.customizedBranding} total={funnel.cohortSize} color="bg-pink-400" />
          </CardContent>
        </Card>
      </div>

      {/* ── Feature Adoption + At-Risk row ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Feature Adoption */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Zap className="w-4 h-4 text-[#0085FF]" />Feature Adoption</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AdoptionBar label="Quotes"      value={adoption.quotes}      total={adoption.total} />
            <AdoptionBar label="Contracts"   value={adoption.contracts}   total={adoption.total} />
            <AdoptionBar label="Galleries"   value={adoption.galleries}   total={adoption.total} />
            <AdoptionBar label="Automations" value={adoption.automations} total={adoption.total} />
            <AdoptionBar label="Lead Capture" value={adoption.leads}      total={adoption.total} />
          </CardContent>
        </Card>

        {/* At-Risk Operators */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              At-Risk Operators
              <span className="text-xs text-gray-400 font-normal ml-1">Paying — no activity in 30 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {atRisk.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">No at-risk operators — all paying operators have been active this month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left px-6 py-2.5 text-xs font-medium text-gray-500 uppercase">Operator</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Events</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Last Login</th>
                </tr></thead>
                <tbody>
                  {atRisk.map(op => (
                    <tr key={op.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{op.name}</td>
                      <td className="px-4 py-3"><Badge variant={PLAN_BADGE[op.plan]}>{PLAN_LABEL[op.plan]}</Badge></td>
                      <td className="px-4 py-3 text-gray-500">{op.totalEvents}</td>
                      <td className="px-4 py-3"><LoginAge date={op.lastLogin} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Operator Activity Table ───────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-sm">Operator Activity</CardTitle>
            <input
              type="text"
              placeholder="Search operators…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0085FF]"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                  <th className="text-left px-6 py-3">Operator</th>
                  <th className="text-left px-4 py-3">Plan</th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700">
                    <SortBtn col="lastLogin" label="Last Login" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700">
                    <SortBtn col="totalEvents" label="Events" />
                  </th>
                  <th className="text-left px-4 py-3">Invoices</th>
                  <th className="text-left px-4 py-3">Features Used</th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700">
                    <SortBtn col="joinedAt" label="Joined" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No operators match your search.</td></tr>
                ) : filtered.map(op => (
                  <tr key={op.id} className={`border-b last:border-0 hover:bg-gray-50 ${op.activeThisMonth ? '' : 'opacity-70'}`}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{op.name}</p>
                      <p className="text-xs text-gray-400">/{op.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={PLAN_BADGE[op.plan]}>{PLAN_LABEL[op.plan]}</Badge>
                    </td>
                    <td className="px-4 py-3"><LoginAge date={op.lastLogin} /></td>
                    <td className="px-4 py-3 font-medium text-gray-700">{op.totalEvents}</td>
                    <td className="px-4 py-3 text-gray-500">{op.totalInvoices}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {op.usesQuotes      && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 rounded-full">Quotes</span>}
                        {op.usesContracts   && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 rounded-full">Contracts</span>}
                        {op.usesGalleries   && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-pink-50 text-pink-700 rounded-full">Gallery</span>}
                        {op.usesAutomations && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 rounded-full">Auto</span>}
                        {op.usesLeads       && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 rounded-full">Leads</span>}
                        {op.stripeEnabled   && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full">Stripe ✓</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {format(new Date(op.joinedAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
