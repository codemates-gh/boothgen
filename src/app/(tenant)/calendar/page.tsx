'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, CalendarX, Copy, Check, RefreshCw, List, CalendarDays } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO,
} from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  LEAD:        'bg-blue-100 text-blue-800',
  QUOTED:      'bg-yellow-100 text-yellow-800',
  BOOKED:      'bg-orange-100 text-orange-800',
  IN_PROGRESS: 'bg-brand text-white',
  COMPLETED:   'bg-green-100 text-green-800',
  ARCHIVED:    'bg-gray-100 text-gray-500',
  CANCELLED:   'bg-gray-100 text-gray-400 line-through',
  LOST:        'bg-gray-100 text-gray-400 line-through',
};

const LEGEND = [
  ['LEAD',      'bg-blue-100 text-blue-800',   'Lead'],
  ['QUOTED',    'bg-yellow-100 text-yellow-800','Quoted'],
  ['BOOKED',    'bg-orange-100 text-orange-800','Booked'],
  ['IN_PROGRESS','bg-brand text-white',         'In Progress'],
  ['COMPLETED', 'bg-green-100 text-green-800',  'Completed'],
  ['ARCHIVED',  'bg-gray-100 text-gray-500',     'Archived'],
] as const;

export default function CalendarPage() {
  const [current, setCurrent] = useState(() => new Date());
  const [events, setEvents]   = useState<any[]>([]);
  const [leads, setLeads]     = useState<any[]>([]);
  const [blackouts, setBlackouts] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);
  const [icalUrl, setIcalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  useEffect(() => {
    Promise.all([
      fetch('/api/events').then(r => r.json()).catch(() => []),
      fetch('/api/leads').then(r => r.json()).catch(() => []),
      fetch('/api/blackout-dates').then(r => r.json()).catch(() => []),
      fetch('/api/calendar/token').then(r => r.json()).catch(() => ({})),
    ]).then(([evts, lds, bds, tokenData]) => {
      setEvents(Array.isArray(evts) ? evts : []);
      setLeads(Array.isArray(lds) ? lds : []);
      setBlackouts(new Set(Array.isArray(bds) ? bds : []));
      if (tokenData?.token) setIcalUrl(`${window.location.origin}/api/calendar/feed/${tokenData.token}`);
      setLoading(false);
    });
  }, []);

  const monthStart  = startOfMonth(current);
  const monthEnd    = endOfMonth(current);
  const calStart    = startOfWeek(monthStart);
  const calEnd      = endOfWeek(monthEnd);
  const today       = new Date();

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const byDate = new Map<string, any[]>();
  for (const ev of events) {
    if (!ev.eventDate) continue;
    const key = format(new Date(ev.eventDate), 'yyyy-MM-dd');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ ...ev, _type: 'event' });
  }
  for (const lead of leads) {
    if (!lead.eventDate || lead.convertedToEventId) continue; // skip converted leads — already shown as events
    const key = format(new Date(lead.eventDate), 'yyyy-MM-dd');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ ...lead, _type: 'lead' });
  }

  async function toggleBlackout(key: string) {
    setToggling(key);
    if (blackouts.has(key)) {
      await fetch('/api/blackout-dates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: key }),
      });
      setBlackouts(prev => { const n = new Set(prev); n.delete(key); return n; });
    } else {
      await fetch('/api/blackout-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: key }),
      });
      setBlackouts(prev => new Set([...prev, key]));
    }
    setToggling(null);
  }

  async function regenerateToken() {
    const res = await fetch('/api/calendar/token', { method: 'POST' });
    const data = await res.json();
    if (data?.token) setIcalUrl(`${window.location.origin}/api/calendar/feed/${data.token}`);
  }

  function copyIcal() {
    if (!icalUrl) return;
    navigator.clipboard.writeText(icalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <TopBar title="Calendar" />
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrent(subMonths(current, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg sm:text-xl font-bold w-44 text-center">
              {format(current, 'MMMM yyyy')}
            </h2>
            <button
              onClick={() => setCurrent(addMonths(current, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrent(new Date())}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Today
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('month')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'month' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <CalendarDays className="w-3.5 h-3.5" />Month
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${viewMode === 'list' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-3.5 h-3.5" />List
              </button>
            </div>
            <button
              onClick={() => setManageMode(v => !v)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${manageMode ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <CalendarX className="w-4 h-4" />
              {manageMode ? 'Done Blocking' : 'Block Dates'}
            </button>
            <Link href="/events/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Event</Button>
            </Link>
          </div>
        </div>

        {manageMode && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Click a date to block or unblock it. Blocked dates show as unavailable to leads on your booking form.
          </div>
        )}

        {/* List view */}
        {viewMode === 'list' && (() => {
          const monthItems: { date: Date; key: string; items: any[] }[] = [];
          const seen = new Set<string>();
          for (const [key, items] of byDate.entries()) {
            const d = parseISO(key);
            if (isSameMonth(d, current) && !seen.has(key)) {
              seen.add(key);
              monthItems.push({ date: d, key, items });
            }
          }
          monthItems.sort((a, b) => a.date.getTime() - b.date.getTime());
          if (monthItems.length === 0) {
            return (
              <div className="text-center py-16 text-gray-400 border border-gray-200 rounded-xl">
                No events or leads scheduled for {format(current, 'MMMM yyyy')}.
              </div>
            );
          }
          return (
            <div className="space-y-3">
              {monthItems.map(({ date, key, items }) => (
                <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className={`px-4 py-2 text-sm font-semibold ${isSameDay(date, today) ? 'bg-brand text-white' : 'bg-gray-50 text-gray-700 border-b border-gray-200'}`}>
                    {format(date, 'EEEE, MMMM d, yyyy')}
                    {blackouts.has(key) && <span className="ml-2 text-xs font-normal opacity-70">· Unavailable</span>}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((ev: any) =>
                      ev._type === 'lead' ? (
                        <Link key={'lead-' + ev.id} href={`/leads/${ev.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{ev.firstName} {ev.lastName}</p>
                            <p className="text-xs text-gray-400">{ev.eventType ?? 'Lead Inquiry'}</p>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex-shrink-0">Lead</span>
                        </Link>
                      ) : (
                        <Link key={ev.id} href={`/events/${ev.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[ev.status]?.split(' ')[0] ?? 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{ev.title}</p>
                            {ev.venue && <p className="text-xs text-gray-400 truncate">{ev.venue}</p>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[ev.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ev.status?.replace(/_/g, ' ')}
                          </span>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Day-of-week headers */}
        {viewMode === 'month' && <div className="grid grid-cols-7 mb-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
            <div key={day} className="text-xs font-semibold text-gray-400 text-center py-1.5 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>}

        {/* Calendar grid */}
        {viewMode === 'month' && <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const key        = format(day, 'yyyy-MM-dd');
              const dayEvents  = byDate.get(key) ?? [];
              const inMonth    = isSameMonth(day, current);
              const isToday    = isSameDay(day, today);
              const isBlacked  = blackouts.has(key);
              const isToggling = toggling === key;

              return (
                <div
                  key={i}
                  onClick={() => manageMode && toggleBlackout(key)}
                  className={[
                    'min-h-[90px] sm:min-h-[110px] border-r border-b border-gray-100 p-1.5 sm:p-2',
                    !inMonth ? 'bg-gray-50/70' : isBlacked ? 'bg-red-50/60' : 'bg-white',
                    i % 7 === 6 ? 'border-r-0' : '',
                    i >= days.length - 7 ? 'border-b-0' : '',
                    manageMode ? 'cursor-pointer hover:bg-red-50 transition-colors' : '',
                    isToggling ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {/* Date number */}
                  {manageMode ? (
                    <span className={[
                      'inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm rounded-full font-medium mb-1',
                      isBlacked
                        ? 'bg-red-500 text-white'
                        : isToday
                          ? 'bg-brand text-white'
                          : inMonth ? 'text-gray-700' : 'text-gray-300',
                    ].join(' ')}>
                      {format(day, 'd')}
                    </span>
                  ) : (
                    <Link href={`/events/new?date=${key}`}>
                      <span className={[
                        'inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm rounded-full font-medium mb-1 transition-colors',
                        isToday
                          ? 'bg-brand text-white'
                          : inMonth
                            ? 'text-gray-700 hover:bg-gray-100'
                            : 'text-gray-300',
                      ].join(' ')}>
                        {format(day, 'd')}
                      </span>
                    </Link>
                  )}

                  {/* Blackout indicator (non-manage mode) */}
                  {!manageMode && isBlacked && (
                    <div className="text-xs px-1.5 py-0.5 rounded truncate font-medium bg-red-100 text-red-600 mb-0.5">
                      Unavailable
                    </div>
                  )}

                  {/* Events + Leads */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, isBlacked ? 2 : 3).map((ev: any) => (
                      ev._type === 'lead' ? (
                        <Link key={'lead-' + ev.id} href={`/leads/${ev.id}`}>
                          <div
                            className="text-xs px-1.5 py-0.5 rounded truncate font-medium hover:opacity-80 transition-opacity bg-purple-100 text-purple-800"
                            title={`${ev.firstName} ${ev.lastName} (Lead)`}
                          >
                            ✦ {ev.firstName} {ev.lastName}
                          </div>
                        </Link>
                      ) : (
                        <Link key={ev.id} href={`/events/${ev.id}`}>
                          <div
                            className={`text-xs px-1.5 py-0.5 rounded truncate font-medium hover:opacity-80 transition-opacity ${STATUS_COLORS[ev.status] ?? 'bg-gray-100 text-gray-600'}`}
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        </Link>
                      )
                    ))}
                    {dayEvents.length > (isBlacked ? 2 : 3) && (
                      <div className="text-xs text-gray-400 pl-1.5">+{dayEvents.length - (isBlacked ? 2 : 3)} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4">
          {LEGEND.map(([, cls, label]) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
              {label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-100" />
            Lead Inquiry
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-100" />
            Unavailable
          </div>
          {loading && <span className="text-xs text-gray-400 ml-auto">Loading…</span>}
        </div>

        {/* Google Calendar / iCal subscription */}
        {icalUrl && (
          <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-semibold text-sm text-gray-800 mb-1">Subscribe to Your Calendar</h3>
              <p className="text-xs text-gray-500">
                Sync your Booth Genius schedule to Google Calendar, Apple Calendar, or Outlook. The feed updates automatically — no re-import needed.
              </p>
            </div>

            {/* What's included */}
            <div className="px-5 py-4 border-b border-gray-100 bg-orange-50/40">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2.5">What's included in this calendar</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { icon: '📅', label: 'Event dates', desc: 'All active events (Lead, Quoted, Booked, Completed) with client name, venue, and status' },
                  { icon: '🎨', label: 'Design approval deadline', desc: 'For Booked/In-Progress events, an entry appears 5 days before the event if no design has been approved yet. Moves to today if the event is already within 5 days.' },
                  { icon: '⚠️', label: 'Urgent design flag', desc: 'Events with no approved design within 2 days are labeled ⚠️ URGENT so they stand out immediately in your calendar.' },
                  { icon: '💳', label: 'Deposit due dates', desc: 'An entry on the day each unpaid deposit is due, showing the client name and amount owed' },
                  { icon: '💰', label: 'Balance due dates', desc: 'An entry on the day each unpaid balance is due, showing the invoice number and amount' },
                  { icon: '🚨', label: 'Overdue payments', desc: 'Any deposit or balance past its due date is labeled OVERDUE so it stands out immediately' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="flex gap-2.5 bg-white border border-gray-100 rounded-lg p-3">
                    <span className="text-base leading-none mt-0.5 flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2.5">Cancelled events and paid milestones are excluded. The feed refreshes on Google Calendar roughly every 24 hours; Apple Calendar and Outlook refresh more frequently.</p>
            </div>

            {/* URL + copy */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Your subscription URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 break-all select-all">
                  {icalUrl}
                </code>
                <button
                  onClick={copyIcal}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Keep this URL private — anyone with it can view your schedule.</p>
            </div>

            {/* Platform instructions */}
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">How to subscribe</p>
              <div className="grid sm:grid-cols-3 gap-3 text-xs text-gray-600">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <span className="text-base">🗓️</span> Google Calendar
                  </p>
                  <ol className="space-y-1 list-decimal list-inside text-gray-500 leading-relaxed">
                    <li>Copy the URL above</li>
                    <li>Open <strong>calendar.google.com</strong></li>
                    <li>On the left, click <strong>+</strong> next to "Other calendars"</li>
                    <li>Select <strong>"From URL"</strong></li>
                    <li>Paste the URL and click <strong>Add calendar</strong></li>
                  </ol>
                  <p className="text-gray-400 mt-2 text-[11px]">Note: Google may take up to 24 hours to refresh new changes.</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <span className="text-base">🍎</span> Apple Calendar
                  </p>
                  <ol className="space-y-1 list-decimal list-inside text-gray-500 leading-relaxed">
                    <li>Copy the URL above</li>
                    <li><strong>Mac:</strong> Open Calendar → File → <strong>New Calendar Subscription…</strong></li>
                    <li>Paste the URL and click <strong>Subscribe</strong></li>
                    <li>Choose refresh frequency and click <strong>OK</strong></li>
                  </ol>
                  <p className="text-gray-400 mt-2 text-[11px]">iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste URL.</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <span className="text-base">📧</span> Outlook
                  </p>
                  <ol className="space-y-1 list-decimal list-inside text-gray-500 leading-relaxed">
                    <li>Copy the URL above</li>
                    <li>Open <strong>Outlook</strong> (desktop or web)</li>
                    <li>Go to Calendar view → <strong>Add calendar</strong></li>
                    <li>Select <strong>"Subscribe from web"</strong></li>
                    <li>Paste the URL and click <strong>Import</strong></li>
                  </ol>
                  <p className="text-gray-400 mt-2 text-[11px]">Outlook desktop: File → Account Settings → Internet Calendars → New → paste URL.</p>
                </div>
              </div>
              <button
                onClick={regenerateToken}
                className="mt-4 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate link — invalidates the old URL and creates a new one
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
