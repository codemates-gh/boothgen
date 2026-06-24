'use client';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, SkipForward, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ExecutionStatus = 'SENT' | 'FAILED' | 'SKIPPED';

interface Execution {
  id: string;
  status: ExecutionStatus;
  recipientEmail: string | null;
  messagePreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  executedAt: string | null;
  tenant: { name: string; branding: { companyName: string | null } | null } | null;
  rule: { name: string; trigger: string } | null;
  event: { title: string } | null;
}

const STATUS_ICON: Record<ExecutionStatus, React.ReactNode> = {
  SENT: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  FAILED: <XCircle className="w-4 h-4 text-red-500" />,
  SKIPPED: <SkipForward className="w-4 h-4 text-gray-400" />,
};

const STATUS_BADGE: Record<ExecutionStatus, 'success' | 'danger' | 'default'> = {
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'default',
};

const FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SKIPPED', label: 'Skipped' },
];

export default function EmailActivityLog({ initialFailedTotal }: { initialFailedTotal: number }) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [failedTotal, setFailedTotal] = useState(initialFailedTotal);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const load = useCallback(async (p = page, s = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (s) params.set('status', s);
      const res = await fetch('/api/super-admin/email-log?' + params);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions);
        setTotal(data.total);
        setFailedTotal(data.failedTotal);
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(1, statusFilter); }, [statusFilter]);

  function changeFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function changePage(p: number) {
    setPage(p);
    load(p, statusFilter);
  }

  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle>Email Activity Log</CardTitle>
            {failedTotal > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-full px-2.5 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {failedTotal} failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => changeFilter(opt.value)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    statusFilter === opt.value
                      ? 'bg-canvas text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(page, statusFilter)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && executions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : executions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No email activity yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tenant</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Recipient</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Template / Trigger</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(ex => (
                    <>
                      <tr
                        key={ex.id}
                        className={`border-b last:border-0 hover:bg-gray-50 ${ex.status === 'FAILED' ? 'bg-red-50/40' : ''}`}
                        onClick={() => ex.status === 'FAILED' && ex.errorMessage && setExpandedError(expandedError === ex.id ? null : ex.id)}
                      >
                        <td className="px-4 py-3">{STATUS_ICON[ex.status]}</td>
                        <td className="px-4 py-3 font-medium">
                          {ex.tenant?.branding?.companyName ?? ex.tenant?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ex.recipientEmail ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{ex.rule?.name ?? '—'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{ex.rule?.trigger ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{ex.event?.title ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {ex.executedAt
                            ? format(new Date(ex.executedAt), 'MMM d, h:mm a')
                            : format(new Date(ex.createdAt), 'MMM d, h:mm a')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[ex.status]}>{ex.status}</Badge>
                          {ex.status === 'FAILED' && ex.errorMessage && (
                            <p className="text-xs text-red-500 mt-0.5 cursor-pointer underline decoration-dotted">
                              {expandedError === ex.id ? 'hide error' : 'show error'}
                            </p>
                          )}
                        </td>
                      </tr>
                      {expandedError === ex.id && ex.errorMessage && (
                        <tr key={ex.id + '-err'} className="bg-red-50 border-b">
                          <td colSpan={7} className="px-4 py-3">
                            <p className="text-xs font-mono text-red-700 break-all">{ex.errorMessage}</p>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-gray-500">{total} total</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => changePage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-xs text-gray-500">{page} / {totalPages}</span>
                  <button
                    onClick={() => changePage(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
