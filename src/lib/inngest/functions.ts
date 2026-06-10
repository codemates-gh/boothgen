
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export const processAutomation = inngest.createFunction(
  { id: 'process-automation', retries: 3 },
  { event: 'automation/execute' },
  async ({ event: evt }) => {
    const { executionId } = evt.data;
    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: { rule: { include: { emailTemplate: true } }, event: { include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } }, tenant: { include: { branding: true } } } } },
    });
    if (!execution || execution.status !== 'SCHEDULED') return;
    if (execution.rule.actionType !== 'EMAIL' || !execution.rule.emailTemplate) {
      await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SKIPPED' } });
      return;
    }
    const { event: ev } = execution;
    const ctx = buildCtx({ client: ev.client, event: ev, invoice: ev.invoices[0] ?? null, branding: ev.tenant.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' });
    const subject = parseMergeTags(execution.rule.emailTemplate.subject, ctx);
    const body = parseMergeTags(execution.rule.emailTemplate.bodyHtml, ctx);
    const result = await sendEmail(ev.client.email, subject, body);
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
    const { tenantId } = evt.data;
    const rules = await prisma.automationRule.findMany({ where: { tenantId, trigger: 'LEAD_CREATED', isActive: true, actionType: 'EMAIL' } });
    return { scheduled: rules.length };
  }
);
