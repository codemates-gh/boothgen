import { describe, it, expect } from 'vitest';
import { eventTimeInput } from '@/lib/utils';

// Report #3: the edit form showed 11:30 AM for an event saved (and shown) as 5:30 PM.
describe('eventTimeInput', () => {
  it('reads a saved time back as the same wall-clock time, whatever the browser zone', () => {
    // Saved the way the events API saves "2026-11-20" + "17:30" on a UTC server
    expect(eventTimeInput('2026-11-20T17:30:00.000Z')).toBe('17:30');
    expect(eventTimeInput(new Date('2026-11-20T21:30:00.000Z'))).toBe('21:30');
  });
  it('round-trips through the save format', () => {
    const saved = new Date(Date.parse('2026-11-20T09:05:00Z'));
    expect(eventTimeInput(saved)).toBe('09:05');
  });
  it('is empty for missing or bad values', () => {
    expect(eventTimeInput(null)).toBe('');
    expect(eventTimeInput(undefined)).toBe('');
    expect(eventTimeInput('not a date')).toBe('');
  });
});
