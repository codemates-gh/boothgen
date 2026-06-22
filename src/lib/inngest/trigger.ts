import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';

const EVENT_DATE_OFFSETS: Record<string, number> = {
  EVENT_DATE_MINUS_14_DAYS: -14 * 24,
  EVENT_DATE_MINUS_7_DAYS: -7 * 24,
  EVENT_DATE_MINUS_1_DAY: -24,
  EVENT_DATE_PLUS_1_DAY: 24,
  EVENT_DATE_PLUS_3_DAYS: 3 * 24,
};

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
      await inngest.send({
        name: 'automation/execute',
        data: { executionId: execution.id },
        ts: scheduledFor.getTime(),
      });
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
        await inngest.send({
          name: 'automation/execute',
          data: { executionId: execution.id },
          ts: scheduledFor.getTime(),
        });
      }
    }
  } catch (err) {
    console.error('[AUTOMATION_SCHEDULE_EVENT_DATE]', err);
  }
}
