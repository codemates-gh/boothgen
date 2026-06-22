
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail, sendDesignReadyEmail, sendDesignDecisionEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';
import { triggerAutomation, scheduleEventDateAutomations } from './trigger';

export const processAutomation = inngest.createFunction(
  { id: 'process-automation', retries: 3 },
  { event: 'automation/execute' },
  async ({ event: evt }) => {
    const { executionId } = evt.data;
    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: { rule: { include: { emailTemplate: true } }, event: { include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } }, Quote: { take: 1, orderBy: { createdAt: 'desc' } }, tenant: { include: { branding: true } } } } },
    });
    if (!execution || execution.status !== 'SCHEDULED') return;
    if (execution.rule.actionType !== 'EMAIL' || !execution.rule.emailTemplate) {
      await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SKIPPED' } });
      return;
    }
    const { event: ev } = execution;
    const branding = ev.tenant.branding;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const ctx = buildCtx({ client: ev.client, event: ev, invoice: ev.invoices[0] ?? null, quote: ev.Quote[0] ?? null, branding: branding ?? {}, appUrl });
    const subject = parseMergeTags(execution.rule.emailTemplate.subject, ctx);
    const body = parseMergeTags(execution.rule.emailTemplate.bodyHtml, ctx);
    const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
    const fromAddress = branding?.companyName ? `${branding.companyName} <${emailFrom}>` : emailFrom;
    const replyTo = branding?.replyToEmail ?? undefined;
    const result = await sendEmail(ev.client.email, subject, body, replyTo, fromAddress);
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: result.success ? 'SENT' : 'FAILED', executedAt: new Date(), errorMessage: result.success ? null : String(result.error), recipientEmail: ev.client.email, messagePreview: subject },
    });
  }
);

export const scheduleLeadCreatedAutomations = inngest.createFunction(
  { id: 'schedule-lead-automations' },
  { event: 'lead/created' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'LEAD_CREATED' });
    return { ok: true };
  }
);

export const scheduleBookingConfirmedAutomations = inngest.createFunction(
  { id: 'schedule-booking-automations' },
  { event: 'booking/confirmed' },
  async ({ event: evt }) => {
    const { tenantId, eventId, eventDate } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'BOOKING_CONFIRMED' });
    if (eventDate) {
      await scheduleEventDateAutomations({ tenantId, eventId, eventDate: new Date(eventDate) });
    }
    return { ok: true };
  }
);

export const scheduleContractSentAutomations = inngest.createFunction(
  { id: 'schedule-contract-sent-automations' },
  { event: 'contract/sent' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'CONTRACT_SENT' });
    return { ok: true };
  }
);

export const scheduleContractExecutedAutomations = inngest.createFunction(
  { id: 'schedule-contract-executed-automations' },
  { event: 'contract/executed' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'CONTRACT_FULLY_EXECUTED' });
    return { ok: true };
  }
);

export const scheduleInvoiceSentAutomations = inngest.createFunction(
  { id: 'schedule-invoice-sent-automations' },
  { event: 'invoice/sent' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'INVOICE_SENT' });
    return { ok: true };
  }
);

export const schedulePaymentReceivedAutomations = inngest.createFunction(
  { id: 'schedule-payment-received-automations' },
  { event: 'payment/received' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'PAYMENT_RECEIVED' });
    return { ok: true };
  }
);

export const scheduleQuoteSentAutomations = inngest.createFunction(
  { id: 'schedule-quote-sent-automations' },
  { event: 'quote/sent' },
  async ({ event: evt }) => {
    const { tenantId, eventId } = evt.data;
    await triggerAutomation({ tenantId, eventId, trigger: 'QUOTE_SENT' });
    return { ok: true };
  }
);

export const notifyClientDesignReady = inngest.createFunction(
  { id: 'notify-client-design-ready', retries: 3 },
  { event: 'template-design/ready-for-review' },
  async ({ event: evt }) => {
    const { designId } = evt.data as { designId: string };
    const design = await prisma.templateDesign.findUnique({
      where: { id: designId },
      include: {
        event: { include: { client: true } },
        tenant: { include: { branding: true } },
      },
    });
    if (!design) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const portalUrl = appUrl + '/portal/' + design.event.portalToken + '?tab=design';
    const companyName = design.tenant.branding?.companyName || design.tenant.name;
    await sendDesignReadyEmail({
      to: design.event.client.email,
      firstName: design.event.client.firstName,
      companyName,
      version: design.version,
      portalUrl,
    });
  }
);

export const notifyHostDesignDecision = inngest.createFunction(
  { id: 'notify-host-design-decision', retries: 3 },
  { event: 'template-design/decision' },
  async ({ event: evt }) => {
    const { designId, decision } = evt.data as { designId: string; decision: 'approved' | 'revision_requested' };
    const design = await prisma.templateDesign.findUnique({
      where: { id: designId },
      include: {
        event: { include: { client: true } },
        tenant: {
          include: {
            branding: true,
            memberships: {
              where: { role: 'HOST_ADMIN', status: 'ACTIVE' },
              include: { user: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!design) return;
    const hostEmail = design.tenant.branding?.replyToEmail ?? design.tenant.memberships[0]?.user?.email;
    if (!hostEmail) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    await sendDesignDecisionEmail({
      to: hostEmail,
      clientName: design.event.client.firstName + ' ' + design.event.client.lastName,
      eventTitle: design.event.title,
      version: design.version,
      decision,
      revisionNote: design.revisionNote ?? undefined,
      designUrl: appUrl + '/events/' + design.eventId + '/designs',
    });
  }
);

export const purgeOldLeadMessages = inngest.createFunction(
  { id: 'purge-old-lead-messages' },
  { cron: '0 3 * * *' }, // 3 AM UTC daily
  async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'message_retention_months' } });
    const months = parseInt(setting?.value ?? '12', 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const { count } = await prisma.leadMessage.deleteMany({ where: { sentAt: { lt: cutoff } } });
    console.log(`[PURGE] Deleted ${count} lead messages older than ${months} months`);
    return { deleted: count, months };
  }
);
