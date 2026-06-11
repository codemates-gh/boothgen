import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'boothgen',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
