import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

const EVENT_DATE_OFFSETS: Record<string, number> = {
  EVENT_DATE_MINUS_14_DAYS: -14 * 24,
  EVENT_DATE_MINUS_7_DAYS: -7 * 24,
  EVENT_DATE_MINUS_1_DAY: -24,
  EVENT_DATE_PLUS_1_DAY: 24,
  EVENT_DATE_PLUS_3_DAYS: 3 * 24,
};

// Core execution logic — shared between direct calls and Inngest processAutomation
export async function executeAutomation(executionId: string) {
  const execution = await prisma.automationExecution.findUnique({
    where: { id: executionId },
    include: {
      rule: { include: { emailTemplate: true } },
      event: {
        include: {
          client: true,
          invoices: { take: 1, orderBy: { createdAt: 'desc' } },
          Quote: { take: 1, orderBy: { createdAt: 'desc' } },
          tenant: { include: { branding: true } },
        },
      },
    },
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
    data: {
      status: result.success ? 'SENT' : 'FAILED',
      executedAt: new Date(),
      errorMessage: result.success ? null : String(result.error),
      recipientEmail: ev.client.email,
      messagePreview: subject,
    },
  });
}

export async function triggerAutomation(params: {
  tenantId: string;
  eventId: string;
  trigger: string;
}) {
  try {
    const { tenantId, eventId, trigger } = params;
    const rules = await prisma.automationRule.findMany({
      where: { tenantId, trigger: trigger as any, isActive: true, actionType: 'EMAIL' },
    });
    if (!rules.length) return;

    for (const rule of rules) {
      const offsetMs = (rule.triggerOffsetHours ?? 0) * 3600 * 1000;
      const scheduledFor = new Date(Date.now() + offsetMs);
      const execution = await prisma.automationExecution.create({
        data: { tenantId, ruleId: rule.id, eventId, status: 'SCHEDULED', scheduledFor },
      });

      if (offsetMs === 0) {
        // Execute immediately — no Inngest needed
        await executeAutomation(execution.id);
      } else {
        // Future delivery — use Inngest scheduler (best-effort)
        inngest.send({
          name: 'automation/execute',
          data: { executionId: execution.id },
          ts: scheduledFor.getTime(),
        }).catch(e => console.error('[AUTOMATION_SCHEDULE]', e));
      }
    }
  } catch (err) {
    console.error('[AUTOMATION_TRIGGER]', err);
  }
}

export async function scheduleEventDateAutomations(params: {
  tenantId: string;
  eventId: string;
  eventDate: Date;
}) {
  try {
    const { tenantId, eventId, eventDate } = params;

    for (const [trigger, offsetHours] of Object.entries(EVENT_DATE_OFFSETS)) {
      const rules = await prisma.automationRule.findMany({
        where: { tenantId, trigger: trigger as any, isActive: true, actionType: 'EMAIL' },
      });
      if (!rules.length) continue;

      const scheduledFor = new Date(eventDate.getTime() + offsetHours * 3600 * 1000);
      if (scheduledFor <= new Date()) continue;

      for (const rule of rules) {
        const existing = await prisma.automationExecution.findFirst({
          where: { eventId, ruleId: rule.id, status: 'SCHEDULED' },
        });
        if (existing) continue;

        const execution = await prisma.automationExecution.create({
          data: { tenantId, ruleId: rule.id, eventId, status: 'SCHEDULED', scheduledFor },
        });
        inngest.send({
          name: 'automation/execute',
          data: { executionId: execution.id },
          ts: scheduledFor.getTime(),
        }).catch(e => console.error('[AUTOMATION_SCHEDULE_EVENT_DATE]', e));
      }
    }
  } catch (err) {
    console.error('[AUTOMATION_SCHEDULE_EVENT_DATE]', err);
  }
}
