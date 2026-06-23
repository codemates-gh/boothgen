'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Search, Trash2, ChevronDown, ArrowUpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type SubscriptionPlan = 'FREE_TRIAL' | 'MONTHLY' | 'ANNUAL';
type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID' | 'INCOMPLETE' | 'INCOMPLETE_EXPIRED';
type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

interface Operator {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  branding: { companyName: string | null } | null;
  stripeSubscription: { plan: SubscriptionPlan; status: SubscriptionStatus } | null;
  stripeConnect: { onboardingStatus: string; chargesEnabled: boolean } | null;
  _count: { events: number };
}

const SC: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  TRIAL: 'warning', ACTIVE: 'success', SUSPENDED: 'danger', CANCELLED: 'default',
};
const CS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  NOT_CONNECTED: 'default', ONBOARDING_INITIATED: 'info', ACTIVE: 'success', RESTRICTED: 'warning', DEAUTHORIZED: 'danger',
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE_TRIAL: 'Commission',
  MONTHLY: 'Pro Monthly',
  ANNUAL: 'Pro Annual',
};

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function ActionsCell({ op }: { op: Operator }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'upgrade' | 'status' | 'delete'>('idle');
  const [busy, setBusy] = useState(false);

  const currentPlan = op.stripeSubscription?.plan ?? 'FREE_TRIAL';

  async function changePlan(plan: SubscriptionPlan) {
    setBusy(true);
    await fetch(`/api/super-admin/tenants/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    setBusy(false);
    setMode('idle');
    router.refresh();
  }

  async function changeStatus(status: TenantStatus) {
    setBusy(true);
    await fetch(`/api/super-admin/tenants/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    setMode('idle');
    router.refresh();
  }

  async function deleteTenant() {
    setBusy(true);
    await fetch(`/api/super-admin/tenants/${op.id}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  if (mode === 'upgrade') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 min-w-[260px]">
        <span className="text-xs text-gray-500 font-medium mr-1">Set plan:</span>
        {(['FREE_TRIAL', 'MONTHLY', 'ANNUAL'] as SubscriptionPlan[]).map(p => (
          <button
            key={p}
            disabled={busy || p === currentPlan}
            onClick={() => changePlan(p)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
              ${p === currentPlan
                ? 'bg-gray-100 text-gray-400 cursor-default'
                : p === 'FREE_TRIAL'
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
          >
            {busy ? '…' : PLAN_LABELS[p]}
          </button>
        ))}
        <button onClick={() => setMode('idle')} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Cancel</button>
      </div>
    );
  }

  if (mode === 'status') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 min-w-[260px]">
        <span className="text-xs text-gray-500 font-medium mr-1">Set status:</span>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.value}
            disabled={busy || s.value === op.status}
            onClick={() => changeStatus(s.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
              ${s.value === op.status
                ? 'bg-gray-100 text-gray-400 cursor-default'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
          >
            {busy ? '…' : s.label}
          </button>
        ))}
        <button onClick={() => setMode('idle')} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Cancel</button>
      </div>
    );
  }

  if (mode === 'delete') {
    const name = op.branding?.companyName ?? op.name;
    return (
      <div className="flex items-center gap-2 min-w-[280px]">
        <span className="text-xs text-red-600 font-medium">
          Delete &ldquo;{name}&rdquo;?{op._count.events > 0 ? ` (${op._count.events} events)` : ''}
        </span>
        <Button size="sm" variant="destructive" onClick={deleteTenant} disabled={busy}>
          {busy ? 'Deleting…' : 'Confirm'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode('idle')}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setMode('upgrade')}
        title="Change plan"
        className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-500 hover:text-purple-700 transition-colors"
      >
        <ArrowUpCircle className="w-4 h-4" />
      </button>
      <button
        onClick={() => setMode('status')}
        title="Change account status"
        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <button
        onClick={() => setMode('delete')}
        title="Delete operator"
        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export function OperatorsTable({ operators }: { operators: Operator[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter(op =>
      (op.branding?.companyName ?? op.name).toLowerCase().includes(q) ||
      op.slug.toLowerCase().includes(q) ||
      op.status.toLowerCase().includes(q) ||
      (op.stripeSubscription?.plan ?? 'FREE_TRIAL').toLowerCase().includes(q)
    );
  }, [query, operators]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>All Operators</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, slug, or plan…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        {query && (
          <p className="text-xs text-gray-400 mt-1">
            {filtered.length} of {operators.length} operator{operators.length !== 1 ? 's' : ''}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Operator</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stripe</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    {query
                      ? <>No operators match &ldquo;{query}&rdquo;</>
                      : <span>No operators found. <button onClick={() => window.location.reload()} className="text-brand underline">Refresh page</button></span>
                    }
                  </td>
                </tr>
              ) : (
                filtered.map(op => (
                  <tr key={op.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-sm">{op.branding?.companyName ?? op.name}</p>
                      <p className="text-xs text-gray-400">/{op.slug}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={SC[op.status]}>{op.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {PLAN_LABELS[op.stripeSubscription?.plan ?? 'FREE_TRIAL']}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={CS[op.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED']} className="text-xs">
                        {op.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{op._count.events}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(op.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ActionsCell op={op} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
