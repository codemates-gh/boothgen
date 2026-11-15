// The one "Booth events" client per account that holds events made from Genie → Events (see boothEvents.ts).
// No imports, so the bundle can use it without a circular import.
export const BOOTH_CLIENT_EMAIL = 'booth-events@boothgen.invalid';

export const isBoothClient = (c: { email: string } | null | undefined) => c?.email === BOOTH_CLIENT_EMAIL;
