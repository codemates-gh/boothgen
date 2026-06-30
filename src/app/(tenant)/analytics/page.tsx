'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
} from 'recharts';
import { DollarSign, Users, Calendar, TrendingUp } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  LEAD: '#3b82f6', QUOTED: '#eab308', BOOKED: '#f97316',
  IN_PROGRESS: '#ea6100', COMPLETED: '#22c55e', ARCHIVED: '#6b7280', CANCELLED: '#9ca3af',
};
const FUNNEL_COLORS = ['#3b82f6','#eab308','#f97316','#22c55e'];

function fmt(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <><TopBar title="Analytics" /><div className="p-8 text-gray-400">Loading analytics…</div></>;
  if (!data)   return <><TopBar title="Analytics" /><div className="p-8 text-gray-400">No data available.</div></>;

  const { monthly, statusDist, funnel, kpis } = data;

  const kpiCards = [
    { label: 'Revenue (12 mo)', value: fmt(kpis.totalRevenue12m), icon: DollarSign, color: 'text-green-500' },
    { label: 'Total Clients',   value: kpis.totalClients,         icon: Users,       color: 'text-blue-500' },
    { label: 'Total Booked',    value: kpis.totalBooked,          icon: Calendar,    color: 'text-brand' },
    { label: 'Avg Booking Value', value: fmt(kpis.avgBookingValue), icon: TrendingUp, color: 'text-purple-500' },
  ];

  return (
    <>
      <TopBar title="Analytics" />
      <div className="p-4 sm:p-8 space-y-6">

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
                  const pct = funnel[0].count > 0 ? Math.round((f.count / funnel[0].count) * 100) : 0;
                  return (
                    <div key={f.stage}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{f.stage}</span>
                        <span className="text-gray-500">{f.count} {i > 0 && funnel[0].count > 0 && <span className="text-xs">({pct}%)</span>}</span>
                      </div>
                      <div className="h-7 bg-gray-100 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all"
                          style={{ width: pct + '%', backgroundColor: FUNNEL_COLORS[i] ?? '#9ca3af' }}
                        />
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

      </div>
    </>
  );
}
