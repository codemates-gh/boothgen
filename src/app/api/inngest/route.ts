export const dynamic = 'force-dynamic';
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  processAutomation,
  scheduleLeadCreatedAutomations,
  scheduleBookingConfirmedAutomations,
  scheduleContractSentAutomations,
  scheduleContractExecutedAutomations,
  scheduleInvoiceSentAutomations,
  schedulePaymentReceivedAutomations,
  scheduleQuoteSentAutomations,
  purgeOldLeadMessages,
  notifyClientDesignReady,
  notifyHostDesignDecision,
  expireGalleries,
  deleteExpiredGalleries,
} from '@/lib/inngest/functions';

const handler = serve({
  client: inngest,
  functions: [
    processAutomation,
    scheduleLeadCreatedAutomations,
    scheduleBookingConfirmedAutomations,
    scheduleContractSentAutomations,
    scheduleContractExecutedAutomations,
    scheduleInvoiceSentAutomations,
    schedulePaymentReceivedAutomations,
    scheduleQuoteSentAutomations,
    purgeOldLeadMessages,
    notifyClientDesignReady,
    notifyHostDesignDecision,
    expireGalleries,
    deleteExpiredGalleries,
  ],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
