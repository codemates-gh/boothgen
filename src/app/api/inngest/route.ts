export const dynamic = 'force-dynamic';
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';

const handler = serve({
  client: inngest,
  functions: [],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
