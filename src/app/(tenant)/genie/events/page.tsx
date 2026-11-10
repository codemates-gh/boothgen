'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Calendar, Lock, AlertTriangle } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@/components/genie/parts';

type Row = {
  id: string; title: string; eventDate: string; status: string; venueName: string | null; clientName: string;
  genie: {
    enabled: boolean; templates: number; ipads: number; maxDevices: number; sessions: number;
    lockedAt: string | null; locksAt: string; timeZone: string; followsDefaults: boolean; shares: { total: number; failed: number };
  } | null;
};

function GenieStatus({ g }: { g: Row['genie'] }) {
  if (!g) return <Badge variant="default">Not set up</Badge>;
  if (!g.enabled) return <Badge variant="default">Off</Badge>;
  if (g.templates === 0) return <Badge variant="warning">No templates</Badge>;
  if (g.lockedAt) return <Badge variant="info"><Lock className="w-3 h-3 mr-1 inline"/>Running</Badge>;
  return <Badge variant="success">Ready</Badge>;
}

export default function GenieEventsPage() {
  const [past, setPast] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const r = await fetch('/api/genie-events' + (past ? '?past=1' : ''));
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) setRows((await r.json()).events);
  }, [past]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <TopBar title="Genie Events"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
        {notEnabled ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
            <p className="text-sm">Genie runs your iPad photo booth and texts or emails guests their photos. Contact support to enable it for your account.</p>
          </CardContent></Card>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Genie Events</h2>
                <p className="text-sm text-gray-500 mt-1">Each event&apos;s booth setup at a glance. New events start from your <Link href="/genie/defaults" className="text-brand hover:underline">event defaults</Link>.</p>
              </div>
            </div>

            <div className="flex border-b border-gray-200">
              {[[false, 'Upcoming'], [true, 'Past']].map(([p, label]) => (
                <button key={String(p)} onClick={() => setPast(p as boolean)} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px ' + (past === p ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
                  {label as string}
                </button>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                {!rows ? <p className="text-sm text-gray-400 p-6">Loading…</p> : rows.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
                    <p className="text-sm">{past ? 'No past events.' : 'No upcoming events.'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                      <thead><tr className="border-b">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Genie</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Templates</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">iPads</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{past ? 'Sessions' : 'Locks'}</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Texts &amp; emails</th>
                      </tr></thead>
                      <tbody>
                        {rows.map(e => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                            <td className="px-6 py-3">
                              <Link href={`/events/${e.id}/genie`} className="text-sm font-medium text-[#1F1F3D] hover:text-brand">{e.title}</Link>
                              <p className="text-xs text-gray-500">{fmtDate(e.eventDate, 'UTC')}{e.venueName ? ' · ' + e.venueName : ''}</p>
                              <p className="text-xs text-gray-400">{e.clientName}</p>
                            </td>
                            <td className="px-6 py-3">
                              <GenieStatus g={e.genie}/>
                              {e.genie?.followsDefaults && <p className="text-xs text-gray-400 mt-1">Uses defaults</p>}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-600">{e.genie ? e.genie.templates : '—'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{e.genie ? `${e.genie.ipads} of ${e.genie.maxDevices}` : '—'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {!e.genie ? '—' : past ? e.genie.sessions : e.genie.lockedAt ? 'Started' : fmtDateTime(e.genie.locksAt, e.genie.timeZone)}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-600">
                              {!e.genie || e.genie.shares.total === 0 ? '—' : (
                                <>{e.genie.shares.total}{e.genie.shares.failed > 0 && <span className="ml-2 inline-flex items-center gap-1 text-xs text-[#E2445C] font-medium"><AlertTriangle className="w-3 h-3"/>{e.genie.shares.failed} failed</span>}</>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
