'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  LEAD:        'bg-blue-100 text-blue-800',
  QUOTED:      'bg-yellow-100 text-yellow-800',
  BOOKED:      'bg-orange-100 text-orange-800',
  IN_PROGRESS: 'bg-brand text-white',
  COMPLETED:   'bg-green-100 text-green-800',
  CANCELLED:   'bg-gray-100 text-gray-400 line-through',
};

const LEGEND = [
  ['LEAD',      'bg-blue-100 text-blue-800',   'Lead'],
  ['QUOTED',    'bg-yellow-100 text-yellow-800','Quoted'],
  ['BOOKED',    'bg-orange-100 text-orange-800','Booked'],
  ['IN_PROGRESS','bg-brand text-white',         'In Progress'],
  ['COMPLETED', 'bg-green-100 text-green-800',  'Completed'],
] as const;

export default function CalendarPage() {
  const [current, setCurrent] = useState(() => new Date());
  const [events, setEvents]   = useState<any[]>([]);
  const [leads, setLeads]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/events').then(r => r.json()).catch(() => []),
      fetch('/api/leads').then(r => r.json()).catch(() => []),
    ]).then(([evts, lds]) => {
      setEvents(Array.isArray(evts) ? evts : []);
      setLeads(Array.isArray(lds) ? lds : []);
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
    if (!lead.eventDate) continue;
    const key = format(new Date(lead.eventDate), 'yyyy-MM-dd');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ ...lead, _type: 'lead' });
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
          <Link href="/events/new">
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Event</Button>
          </Link>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
            <div key={day} className="text-xs font-semibold text-gray-400 text-center py-1.5 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const key        = format(day, 'yyyy-MM-dd');
              const dayEvents  = byDate.get(key) ?? [];
              const inMonth    = isSameMonth(day, current);
              const isToday    = isSameDay(day, today);

              return (
                <div
                  key={i}
                  className={[
                    'min-h-[90px] sm:min-h-[110px] border-r border-b border-gray-100 p-1.5 sm:p-2',
                    !inMonth ? 'bg-gray-50/70' : 'bg-white',
                    i % 7 === 6 ? 'border-r-0' : '',
                    i >= days.length - 7 ? 'border-b-0' : '',
                  ].join(' ')}
                >
                  {/* Date number */}
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

                  {/* Events + Leads */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev: any) => (
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
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-gray-400 pl-1.5">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
          {loading && <span className="text-xs text-gray-400 ml-auto">Loading…</span>}
        </div>
      </div>
    </>
  );
}
