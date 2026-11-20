'use client';
import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TimeZoneSelect } from '@/components/genie/SettingsForms';

// New booth event (Genie → Events) and editing a booth event's details (its Genie page)

export type BoothEventValues = { title: string; date: string; startTime: string; endDate?: string; endTime: string; venueName: string; timeZone: string };

// "YYYY-MM-DD" of an instant in a time zone; the End Date field shows it only when it's after the start date
export function localEndDate(iso: string | null, startDate: string, timeZone: string): string {
  if (!iso) return '';
  const d = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return d > startDate ? d : '';
}

// "HH:MM" of an instant in a time zone, for the edit form
export function localTime(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  return `${p.find(x => x.type === 'hour')?.value}:${p.find(x => x.type === 'minute')?.value}`;
}

export function BoothEventModal({ open, onClose, initial, eventId, lockedDate, lockedTimes, onSaved }: {
  open: boolean; onClose: () => void; initial: BoothEventValues;
  eventId?: string; // editing when set
  lockedDate?: boolean; // the event day has started: the date can't change
  lockedTimes?: boolean; // the event day is over: the times can't change either
  onSaved: (id: string) => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setV(initial); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof BoothEventValues, val: string) => setV(p => ({ ...p, [k]: val }));

  async function submit() {
    setBusy(true); setError('');
    const body: Record<string, unknown> = { title: v.title, date: v.date, startTime: v.startTime || null, endDate: v.endDate || null, endTime: v.endTime || null, venueName: v.venueName || null };
    if (!eventId) body.timeZone = v.timeZone;
    const r = await fetch(eventId ? `/api/genie-events/${eventId}` : '/api/genie-events', { method: eventId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not save the event'); return; }
    onSaved(eventId ?? d.id);
  }

  const dateRef = useRef<HTMLInputElement>(null);
  function openDatePicker() {
    const el = dateRef.current;
    if (!el || el.disabled) return;
    try { el.showPicker(); } catch { el.focus(); }
  }

  return (
    <Modal open={open} onClose={onClose} title={eventId ? 'Event Details' : 'New Booth Event'}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event name</label>
          <Input value={v.title} onChange={e => set('title', e.target.value)} maxLength={200} autoFocus placeholder="Rivera Wedding"/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            {/* The browser's own calendar icon isn't shown everywhere (Safari), so the field has its own button */}
            <div className="relative">
              <Input ref={dateRef} type="date" value={v.date} onChange={e => set('date', e.target.value)} disabled={lockedDate || lockedTimes}
                onClick={() => openDatePicker()} className="!pr-9 [&::-webkit-calendar-picker-indicator]:hidden"/>
              <button type="button" aria-label="Pick a date" disabled={lockedDate || lockedTimes} onClick={() => openDatePicker()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800 disabled:opacity-50">
                <Calendar className="w-4 h-4"/>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
            <Input type="time" value={v.startTime} onChange={e => set('startTime', e.target.value)} disabled={lockedTimes}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End date <span className="text-gray-400 font-normal">(if a later day)</span></label>
            <Input type="date" value={v.endDate ?? ''} min={v.date || undefined} onChange={e => set('endDate', e.target.value)} disabled={lockedTimes}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
            <Input type="time" value={v.endTime} onChange={e => set('endTime', e.target.value)} disabled={lockedTimes}/>
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          {lockedTimes ? 'The event day is over, so its date and times can no longer change.'
            : lockedDate ? 'The event day has started, so its date can no longer change. The times can until the end of the day.'
            : 'Guests can use the booth from 12:00 AM on the start date until 11:59 PM two days later; before that, iPads can only run tests. The date locks at 12:00 AM on the event day. An end time earlier than the start means the next day; it can be at most 48 hours after the start.'}
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Venue <span className="text-gray-400 font-normal">(optional)</span></label>
          <Input value={v.venueName} onChange={e => set('venueName', e.target.value)} maxLength={200} placeholder="The Glasshouse"/>
        </div>
        {!eventId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time zone</label>
            <TimeZoneSelect value={v.timeZone} onChange={tz => set('timeZone', tz)}/>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !v.title.trim() || !v.date || !v.startTime || !v.timeZone}>{busy ? 'Saving…' : eventId ? 'Save' : 'Create Event'}</Button>
        </div>
      </form>
    </Modal>
  );
}
