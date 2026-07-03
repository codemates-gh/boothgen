'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Search, Trash2, ChevronDown, ArrowUpCircle, AlertTriangle, Check, CreditCard } from 'lucide-react';
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
  stripeSubscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
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

type Mode = 'idle' | 'upgrade' | 'status' | 'delete' | 'subscription';
type SubConfirm = 'cancel-now' | 'refund' | null;

function ActionsCell({ op }: { op: Operator }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [subConfirm, setSubConfirm] = useState<SubConfirm>(null);
  const [busy, setBusy] = useState(false);
  const [subError, setSubError] = useState('');
  const [subSuccess, setSubSuccess] = useState('');

  const currentPlan = op.stripeSubscription?.plan ?? 'FREE_TRIAL';
  const hasStripeSub = !!op.stripeSubscription?.stripeSubscriptionId;
  const hasStripeCustomer = !!op.stripeSubscription?.stripeCustomerId;

  function resetSubscriptionMode() {
    setSubConfirm(null);
    setSubError('');
    setSubSuccess('');
  }

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

  async function cancelSub(immediate: boolean) {
    setBusy(true);
    setSubError('');
    const res = await fetch(`/api/super-admin/tenants/${op.id}/subscription`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubError(data.error ?? 'Cancellation failed');
      setSubConfirm(null);
      return;
    }
    setSubSuccess(immediate ? 'Subscription cancelled immediately.' : 'Set to cancel at period end.');
    setSubConfirm(null);
    router.refresh();
  }

  async function refundLastCharge() {
    setBusy(true);
    setSubError('');
    const res = await fetch(`/api/super-admin/tenants/${op.id}/subscription`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setSubError(data.error ?? 'Refund failed');
      setSubConfirm(null);
      return;
    }
    const dollars = data.amountCents ? `$${(data.amountCents / 100).toFixed(2)}` : '';
    setSubSuccess(`Refund issued${dollars ? ` (${dollars})` : ''}.`);
    setSubConfirm(null);
  }

  // ── Plan picker ────────────────────────────────────────────────
  if (mode === 'upgrade') {
    return (
      <div className="w-44">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Change Plan</p>
        <div className="space-y-1">
          {(['FREE_TRIAL', 'MONTHLY', 'ANNUAL'] as SubscriptionPlan[]).map(p => {
            const isCurrent = p === currentPlan;
            return (
              <button
                key={p}
                disabled={busy || isCurrent}
                onClick={() => changePlan(p)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${isCurrent
                    ? 'bg-gray-100 text-gray-500 cursor-default font-medium'
                    : 'border border-gray-200 text-gray-700 hover:border-brand hover:text-brand hover:bg-orange-50 font-medium'
                  }`}
              >
                <span>{busy && !isCurrent ? '…' : PLAN_LABELS[p]}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              </button>
            );
          })}
        </div>
        <button onClick={() => setMode('idle')} className="text-xs text-gray-400 hover:text-gray-600 mt-2 block">Cancel</button>
      </div>
    );
  }

  // ── Status picker ──────────────────────────────────────────────
  if (mode === 'status') {
    return (
      <div className="w-44">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Change Status</p>
        <div className="space-y-1">
          {STATUS_OPTIONS.map(s => {
            const isCurrent = s.value === op.status;
            return (
              <button
                key={s.value}
                disabled={busy || isCurrent}
                onClick={() => changeStatus(s.value)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${isCurrent
                    ? 'bg-gray-100 text-gray-500 cursor-default font-medium'
                    : 'border border-gray-200 text-gray-700 hover:border-brand hover:text-brand hover:bg-orange-50 font-medium'
                  }`}
              >
                <span>{busy && !isCurrent ? '…' : s.label}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              </button>
            );
          })}
        </div>
        <button onClick={() => setMode('idle')} className="text-xs text-gray-400 hover:text-gray-600 mt-2 block">Cancel</button>
      </div>
    );
  }

  // ── Delete confirm ─────────────────────────────────────────────
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

  // ── Subscription management ────────────────────────────────────
  if (mode === 'subscription') {
    const periodEnd = op.stripeSubscription?.currentPeriodEnd;
    const cancelPending = op.stripeSubscription?.cancelAtPeriodEnd;

    // Confirm: cancel immediately
    if (subConfirm === 'cancel-now') {
      return (
        <div className="w-56 space-y-2">
          <p className="text-xs font-semibold text-red-700">Cancel immediately?</p>
          <p className="text-xs text-gray-500">Operator loses Pro access right now. This cannot be undone.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => cancelSub(true)} disabled={busy}>
              {busy ? 'Cancelling…' : 'Confirm'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubConfirm(null)}>Back</Button>
          </div>
        </div>
      );
    }

    // Confirm: refund last charge
    if (subConfirm === 'refund') {
      return (
        <div className="w-56 space-y-2">
          <p className="text-xs font-semibold text-gray-800">Refund last charge?</p>
          <p className="text-xs text-gray-500">Issues a full refund for the most recent subscription payment.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={refundLastCharge} disabled={busy}>
              {busy ? 'Refunding…' : 'Confirm Refund'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubConfirm(null)}>Back</Button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-52 space-y-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Subscription</p>

        {periodEnd && (
          <p className="text-xs text-gray-500">
            Period ends {format(new Date(periodEnd), 'MMM d, yyyy')}
            {cancelPending && <span className="ml-1 text-amber-600 font-medium">(cancels)</span>}
          </p>
        )}

        {subSuccess && (
          <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">{subSuccess}</p>
        )}
        {subError && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{subError}</p>
        )}

        <div className="space-y-1">
          {hasStripeSub && !cancelPending && (
            <button
              onClick={() => cancelSub(false)}
              disabled={busy}
              className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors font-medium"
            >
              Cancel at period end
            </button>
          )}

          {hasStripeSub && (
            <button
              onClick={() => setSubConfirm('cancel-now')}
              disabled={busy}
              className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-600 hover:bg-red-50 transition-colors font-medium"
            >
              Cancel immediately
            </button>
          )}

          {hasStripeSub && (
            <button
              onClick={() => setSubConfirm('refund')}
              disabled={busy}
              className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:border-brand hover:text-brand hover:bg-orange-50 transition-colors font-medium"
            >
              Refund last charge
            </button>
          )}

          {!hasStripeSub && (
            <p className="text-xs text-gray-400 px-1">No paid subscription on record — nothing to cancel or refund.</p>
          )}
        </div>

        <button
          onClick={() => { setMode('idle'); resetSubscriptionMode(); }}
          className="text-xs text-gray-400 hover:text-gray-600 mt-1 block"
        >
          Back
        </button>
      </div>
    );
  }

  // ── Idle: icon buttons ─────────────────────────────────────────
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
      {hasStripeSub && (
        <button
          onClick={() => { setMode('subscription'); resetSubscriptionMode(); }}
          title="Manage subscription"
          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition-colors"
        >
          <CreditCard className="w-4 h-4" />
        </button>
      )}
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

export function OperatorsTable({ operators, failedMap = {} }: { operators: Operator[]; failedMap?: Record<string, number> }) {
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
                      {failedMap[op.id] > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium mt-0.5">
                          <AlertTriangle className="w-3 h-3" />{failedMap[op.id]} email {failedMap[op.id] === 1 ? 'failure' : 'failures'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={SC[op.status]}>{op.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {PLAN_LABELS[op.stripeSubscription?.plan ?? 'FREE_TRIAL']}
                      {op.stripeSubscription?.cancelAtPeriodEnd && (
                        <span className="block text-xs text-amber-600">cancels at period end</span>
                      )}
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
