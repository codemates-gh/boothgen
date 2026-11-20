import { vi } from 'vitest';

// Most fixtures use a future event date (2026-12-12). The "test-only before the event day" rule (G, 2026-11-20) would
// refuse their guest photos and shares, so it's off by default and turned on by the tests about it
// (globalThis.__eventDayGate = true).
vi.mock('@/lib/genie/sessions', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/genie/sessions')>();
  return {
    ...real,
    beforeEventDay: (...args: Parameters<typeof real.beforeEventDay>) =>
      (globalThis as { __eventDayGate?: boolean }).__eventDayGate ? real.beforeEventDay(...args) : Promise.resolve(false),
  };
});
