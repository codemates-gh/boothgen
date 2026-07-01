import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'codemates@gmail.com';

export async function notifyAdminOfFailure(executionId: string, errorMessage: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  try {
    const exec = await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', executedAt: new Date(), errorMessage },
      include: {
        tenant: { select: { name: true, branding: { select: { companyName: true } } } },
        rule: { select: { name: true, trigger: true } },
        event: { select: { title: true } },
      },
    });
    const tenantName = exec.tenant?.branding?.companyName ?? exec.tenant?.name ?? 'Unknown';
    await sendEmail(
      ADMIN_EMAIL,
      `[Booth Genius] Automation email failed — ${tenantName}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:18px;color:#dc2626;margin:0 0 16px">⚠️ Automation Email Failure</h2>
<p style="margin:0 0 20px;color:#374151">An automated email failed to send after all retries were exhausted.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px">
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px">Tenant</td><td style="padding:8px 0;font-size:14px;font-weight:600">${tenantName}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Recipient</td><td style="padding:8px 0;font-size:14px">${exec.recipientEmail ?? '—'}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Template</td><td style="padding:8px 0;font-size:14px">${exec.rule?.name ?? '—'}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Trigger</td><td style="padding:8px 0;font-size:14px">${exec.rule?.trigger ?? '—'}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Event</td><td style="padding:8px 0;font-size:14px">${exec.event?.title ?? '—'}</td></tr>
  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top">Error</td><td style="padding:8px 0;font-size:13px;color:#dc2626;word-break:break-all">${errorMessage}</td></tr>
</table>
<a href="${appUrl}/super-admin" style="background:#F97316;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Email Activity Log</a>
</div>`,
      undefined,
      `Booth Genius <${process.env.EMAIL_FROM ?? 'noreply@boothgen.com'}>`
    );
  } catch (err) {
    console.error('[AUTOMATION_FAILURE_ALERT]', err);
  }
}

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
  const gallery = execution.rule.trigger === 'GALLERY_PUBLISHED'
    ? await prisma.gallery.findFirst({ where: { eventId: ev.id, isPublished: true }, select: { accessCode: true, clientToken: true } })
    : null;
  const ctx = buildCtx({ client: ev.client, event: ev, invoice: ev.invoices[0] ?? null, quote: ev.Quote[0] ?? null, branding: branding ?? {}, gallery, appUrl });
  const subject = parseMergeTags(execution.rule.emailTemplate.subject, ctx);
  const body = parseMergeTags(execution.rule.emailTemplate.bodyHtml, ctx);
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromAddress = branding?.companyName ? `${branding.companyName} <${emailFrom}>` : emailFrom;
  const replyTo = branding?.replyToEmail ?? undefined;
  // Pre-save recipient + subject so the log is useful even if the send fails mid-retry
  await prisma.automationExecution.update({
    where: { id: executionId },
    data: { recipientEmail: ev.client.email, messagePreview: subject },
  });

  const result = await sendEmail(ev.client.email, subject, body, replyTo, fromAddress);
  if (!result.success) {
    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
  }

  await prisma.automationExecution.update({
    where: { id: executionId },
    data: { status: 'SENT', executedAt: new Date() },
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
        // Execute immediately — catch here since Inngest isn't in the loop for this path
        try {
          await executeAutomation(execution.id);
        } catch (err) {
          await notifyAdminOfFailure(execution.id, String(err));
        }
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
