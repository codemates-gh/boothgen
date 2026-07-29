'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { DollarSign, Users, Calendar, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { fmtCents } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  LEAD: '#3b82f6', QUOTED: '#eab308', BOOKED: '#f97316',
  IN_PROGRESS: '#ea6100', COMPLETED: '#22c55e', ARCHIVED: '#6b7280', CANCELLED: '#9ca3af',
};
const FUNNEL_COLORS = ['#3b82f6','#eab308','#f97316','#22c55e'];

function fmtD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

const TABS = ['Overview', 'Profitability'] as const;
type Tab = typeof TABS[number];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [data, setData] = useState<any>(null);
  const [profData, setProfData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics').then(r => r.json()),
      fetch('/api/analytics/profitability').then(async r => ({ ok: r.ok, data: r.ok ? await r.json() : null })),
    ]).then(([main, prof]) => {
      setData(main);
      if (prof.ok) { setProfData(prof.data); setIsAdmin(true); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <><TopBar title="Analytics" /><div className="p-8 text-gray-400">Loading analytics…</div></>;
  if (!data)   return <><TopBar title="Analytics" /><div className="p-8 text-gray-400">No data available.</div></>;

  const { monthly, statusDist, funnel, kpis } = data;

  const kpiCards = [
    { label: 'Revenue (12 mo)', value: fmtD(kpis.totalRevenue12m), icon: DollarSign, color: 'text-green-500' },
    { label: 'Total Clients',   value: kpis.totalClients,           icon: Users,       color: 'text-blue-500' },
    { label: 'Total Booked',    value: kpis.totalBooked,            icon: Calendar,    color: 'text-brand' },
    { label: 'Avg Booking Value', value: fmtD(kpis.avgBookingValue), icon: TrendingUp, color: 'text-purple-500' },
  ];

  const availableTabs = isAdmin ? TABS : (['Overview'] as Tab[]);

  return (
    <>
      <TopBar title="Analytics" />
      <div className="p-4 sm:p-8 space-y-6">

        {/* Tab nav */}
        {isAdmin && (
          <div className="flex border-b border-gray-200">
            {availableTabs.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={'px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ' + (tab === t ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {tab === 'Overview' && (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map(k => (
                <Card key={k.label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-500">{k.label}</p>
                      <k.icon className={`w-5 h-5 ${k.color}`} />
                    </div>
                    <p className="text-2xl font-bold">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Revenue by month */}
            <Card>
              <CardHeader><CardTitle>Revenue — Last 12 Months</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)} />
                    <Tooltip formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Revenue']} />
                    <Bar dataKey="revenue" fill="#f97316" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Bookings & Leads by month */}
            <Card>
              <CardHeader><CardTitle>Bookings &amp; Leads — Last 12 Months</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bookings" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Bookings" />
                    <Line type="monotone" dataKey="leads"    stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Leads" strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-5 mt-3 text-xs text-gray-500 pl-2">
                  <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-orange-400 inline-block"/><span className="font-medium text-orange-500">Bookings</span> (by event date)</span>
                  <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-blue-400 inline-block border-dashed"/><span className="font-medium text-blue-500">Leads</span> (form submissions)</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Conversion funnel */}
              <Card>
                <CardHeader><CardTitle>Conversion Funnel (All Time)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 pt-2">
                    {funnel.map((f: any, i: number) => {
                      const p = funnel[0].count > 0 ? Math.round((f.count / funnel[0].count) * 100) : 0;
                      return (
                        <div key={f.stage}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{f.stage}</span>
                            <span className="text-gray-500">{f.count} {i > 0 && funnel[0].count > 0 && <span className="text-xs">({p}%)</span>}</span>
                          </div>
                          <div className="h-7 bg-gray-100 rounded-lg overflow-hidden">
                            <div className="h-full rounded-lg transition-all" style={{ width: p + '%', backgroundColor: FUNNEL_COLORS[i] ?? '#9ca3af' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Event status distribution */}
              <Card>
                <CardHeader><CardTitle>Events by Status (All Time)</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={statusDist} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {statusDist.map((s: any) => (
                            <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#e5e7eb'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any, name: any) => [v, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {statusDist.sort((a: any, b: any) => b.count - a.count).map((s: any) => (
                        <div key={s.status} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s.status] ?? '#e5e7eb' }} />
                            <span className="text-gray-600 capitalize">{s.status.replace('_',' ').toLowerCase()}</span>
                          </div>
                          <span className="font-semibold text-gray-800">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {tab === 'Profitability' && profData && (
          <ProfitabilityTab data={profData} />
        )}
      </div>
    </>
  );
}

function ProfitabilityTab({ data }: { data: { rows: any[]; totals: any } }) {
  const { rows, totals } = data;

  const chartData = rows
    .filter(r => r.revenueCents > 0 || r.totalCostCents > 0)
    .slice(0, 20)
    .map(r => ({
      name: r.title.length > 18 ? r.title.slice(0, 16) + '…' : r.title,
      Revenue: Math.round(r.revenueCents / 100),
      Cost: Math.round(r.totalCostCents / 100),
      Profit: Math.round(r.profitCents / 100),
    }));

  const overallMargin = totals.revenueCents > 0
    ? Math.round((totals.profitCents / totals.revenueCents) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmtD(totals.revenueCents), color: 'text-green-600' },
          { label: 'Total Cost', value: fmtD(totals.totalCostCents), color: 'text-gray-700' },
          { label: 'Net Profit', value: fmtD(totals.profitCents), color: totals.profitCents >= 0 ? 'text-emerald-600' : 'text-red-600' },
          { label: 'Overall Margin', value: overallMargin !== null ? `${overallMargin}%` : '—', color: (overallMargin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600' },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <p className="text-sm font-medium text-gray-500 mb-2">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Revenue vs Cost by Event (recent 20)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)} />
                <Tooltip formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
                <Bar dataKey="Revenue" fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="Cost" fill="#f97316" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-event table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Per-Event Breakdown</CardTitle>
            <p className="text-xs text-gray-400">Booked, Completed &amp; Archived events</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">No events with cost/revenue data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                    <th className="text-left px-6 py-3">Event</th>
                    <th className="text-right px-4 py-3 w-[100px]">Revenue</th>
                    <th className="text-right px-4 py-3 w-[80px]">Prints</th>
                    <th className="text-right px-4 py-3 w-[100px]">Print Cost</th>
                    <th className="text-right px-4 py-3 w-[100px]">Other Exp.</th>
                    <th className="text-right px-4 py-3 w-[100px]">Profit</th>
                    <th className="text-right px-4 py-3 w-[70px]">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const profitPos = r.profitCents >= 0;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <Link href={`/events/${r.id}`} className="font-medium text-sm hover:text-brand">{r.title}</Link>
                          <p className="text-xs text-gray-400">{new Date(r.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{fmtD(r.revenueCents)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{r.printCount > 0 ? r.printCount : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-sm">{r.printCostCents > 0 ? fmtD(r.printCostCents) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-sm">{r.otherExpensesCents > 0 ? fmtD(r.otherExpensesCents) : <span className="text-gray-300">—</span>}</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${profitPos ? 'text-emerald-600' : 'text-red-600'}`}>{fmtD(r.profitCents)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-medium ${profitPos ? 'text-emerald-600' : 'text-red-600'}`}>{r.marginPct !== null ? `${r.marginPct}%` : <span className="text-gray-300">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-sm border-t-2">
                    <td className="px-6 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{fmtD(totals.revenueCents)}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className={`px-4 py-3 text-right ${totals.profitCents >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtD(totals.profitCents)}</td>
                    <td className={`px-4 py-3 text-right ${(overallMargin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{overallMargin !== null ? `${overallMargin}%` : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
