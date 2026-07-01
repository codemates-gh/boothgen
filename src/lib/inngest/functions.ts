
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail, sendDesignReadyEmail, sendDesignDecisionEmail, sendPaymentReminderEmail, sendGalleryDeletionReminderEmail, sendDesignApprovalReminderEmail } from '@/lib/email/send';
import { triggerAutomation, scheduleEventDateAutomations, executeAutomation, notifyAdminOfFailure } from './trigger';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export const processAutomation = inngest.createFunction(
  {
    id: 'process-automation',
    retries: 3,
    onFailure: async ({ event, error }) => {
      // Fires after all retries are exhausted — mark FAILED and alert super admin
      const executionId = (event.data as any).event?.data?.executionId as string | undefined;
      if (executionId) {
        await notifyAdminOfFailure(executionId, error.message).catch(e =>
          console.error('[AUTOMATION_ON_FAILURE]', e)
        );
      }
    },
  },
  { event: 'automation/execute' },
  async ({ event: evt }) => {
    const { executionId } = evt.data;
    await executeAutomation(executionId);
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

    // Schedule design approval check 5 days before the event.
    // If the event is already within 5 days, fire within the next minute.
    if (eventDate) {
      const fiveDaysBefore = new Date(new Date(eventDate).getTime() - 5 * 86400_000);
      const fireAt = fiveDaysBefore > new Date() ? fiveDaysBefore : new Date(Date.now() + 60_000);
      inngest.send({
        name: 'design/approval-check',
        data: { eventId },
        ts: fireAt.getTime(),
      }).catch(e => console.error('[BOOKING_CONFIRMED] design-check schedule error:', e));
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
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    });
    if (!design) return;

    // Collect all host admin emails; fall back to branding replyToEmail if set
    const adminEmails = design.tenant.memberships
      .map(m => m.user?.email)
      .filter((e): e is string => Boolean(e));
    const replyTo = design.tenant.branding?.replyToEmail;
    const recipients = replyTo ? [replyTo, ...adminEmails.filter(e => e !== replyTo)] : adminEmails;
    if (recipients.length === 0) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    await Promise.all(
      recipients.map(to =>
        sendDesignDecisionEmail({
          to,
          clientName: design.event.client.firstName + ' ' + design.event.client.lastName,
          eventTitle: design.event.title,
          version: design.version,
          decision,
          revisionNote: design.revisionNote ?? undefined,
          designUrl: appUrl + '/events/' + design.eventId + '/designs',
        })
      )
    );
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

    // For leads converted to events: delete messages X months after the event date
    // (never deletes messages for events that haven't happened yet)
    const { count: countEvents } = await prisma.leadMessage.deleteMany({
      where: {
        lead: {
          convertedToEventId: { not: null },
          convertedToEvent: { eventDate: { lt: cutoff } },
        },
      },
    });

    // For pure leads (never converted to an event): fall back to message date
    const { count: countLeads } = await prisma.leadMessage.deleteMany({
      where: {
        sentAt: { lt: cutoff },
        lead: { convertedToEventId: null },
      },
    });

    const total = countEvents + countLeads;
    console.log(`[PURGE] Deleted ${total} lead messages (${countEvents} by event date, ${countLeads} by message date) — ${months} month cutoff`);
    return { deleted: total, months };
  }
);

// Expire galleries: unpublish + flag galleries whose event date is past the expiry window
export const expireGalleries = inngest.createFunction(
  { id: 'expire-galleries' },
  { cron: '0 4 * * *' }, // 4 AM UTC daily
  async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'gallery_expire_days' } });
    const expireDays = parseInt(setting?.value ?? '30', 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - expireDays);

    // Find published, non-expired galleries whose event date is before the cutoff
    const toExpire = await prisma.gallery.findMany({
      where: {
        isPublished: true,
        isExpired: false,
        event: { eventDate: { lt: cutoff } },
      },
      select: { id: true },
    });

    if (toExpire.length === 0) return { expired: 0 };

    const { count } = await prisma.gallery.updateMany({
      where: { id: { in: toExpire.map(g => g.id) } },
      data: { isPublished: false, isExpired: true },
    });

    console.log(`[GALLERY_EXPIRE] Expired ${count} galleries (cutoff: ${cutoff.toISOString()})`);
    return { expired: count, expireDays };
  }
);

// Delete expired galleries: remove R2 files and DB records after the delete window
export const deleteExpiredGalleries = inngest.createFunction(
  { id: 'delete-expired-galleries' },
  { cron: '30 4 * * *' }, // 4:30 AM UTC daily (30 min after expire job)
  async () => {
    const [expireSetting, deleteSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'gallery_expire_days' } }),
      prisma.systemSetting.findUnique({ where: { key: 'gallery_delete_days' } }),
    ]);
    const expireDays = parseInt(expireSetting?.value ?? '30', 10);
    const deleteDays = parseInt(deleteSetting?.value ?? '30', 10);
    const totalDays = expireDays + deleteDays;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - totalDays);

    const toDelete = await prisma.gallery.findMany({
      where: {
        isExpired: true,
        event: { eventDate: { lt: cutoff } },
      },
      include: { assets: { select: { id: true, url: true } } },
    });

    if (toDelete.length === 0) return { deleted: 0 };

    let filesDeleted = 0;
    for (const gallery of toDelete) {
      // Delete each asset from R2
      for (const asset of gallery.assets) {
        try {
          await deleteFromR2(r2KeyFromUrl(asset.url));
          filesDeleted++;
        } catch (err) {
          console.error(`[GALLERY_DELETE] R2 delete failed for ${asset.url}:`, err);
        }
      }
      // Delete gallery record (cascades to assets in DB)
      await prisma.gallery.delete({ where: { id: gallery.id } });
    }

    console.log(`[GALLERY_DELETE] Deleted ${toDelete.length} galleries, ${filesDeleted} R2 files (cutoff: ${cutoff.toISOString()})`);
    return { deleted: toDelete.length, filesDeleted, expireDays, deleteDays };
  }
);

// Send gallery deletion reminders to host admins 2 days before permanent deletion
export const sendGalleryDeletionReminders = inngest.createFunction(
  { id: 'send-gallery-deletion-reminders' },
  { cron: '0 10 * * *' }, // 10 AM UTC daily
  async () => {
    const [expireSetting, deleteSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'gallery_expire_days' } }),
      prisma.systemSetting.findUnique({ where: { key: 'gallery_delete_days' } }),
    ]);
    const expireDays = parseInt(expireSetting?.value ?? '30', 10);
    const deleteDays = parseInt(deleteSetting?.value ?? '30', 10);
    const totalDays  = expireDays + deleteDays;

    // Deletion date is eventDate + totalDays. We want galleries deleting in exactly 2 days.
    // So eventDate + totalDays = today + 2  →  eventDate = today + 2 - totalDays
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + 2 - totalDays);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1);

    const galleries = await prisma.gallery.findMany({
      where: {
        isExpired: true,
        event: { eventDate: { gte: windowStart, lt: windowEnd } },
      },
      include: {
        event: { select: { title: true, eventDate: true } },
        tenant: {
          include: {
            branding: { select: { companyName: true } },
            memberships: {
              where: { role: 'HOST_ADMIN', status: 'ACTIVE' },
              include: { user: { select: { email: true } } },
            },
          },
        },
        _count: { select: { assets: true } },
      },
    });

    if (galleries.length === 0) return { reminded: 0 };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    let reminded = 0;

    for (const gallery of galleries) {
      const adminEmails = gallery.tenant.memberships
        .map(m => m.user?.email)
        .filter((e): e is string => Boolean(e));
      if (adminEmails.length === 0) continue;

      const deletionDate = new Date(gallery.event.eventDate!);
      deletionDate.setDate(deletionDate.getDate() + totalDays);
      const formattedDate = deletionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const companyName = gallery.tenant.branding?.companyName ?? gallery.tenant.name;

      try {
        await sendGalleryDeletionReminderEmail({
          to: adminEmails,
          companyName,
          galleryTitle: gallery.title,
          eventTitle: gallery.event.title,
          photoCount: gallery._count.assets,
          deletionDate: formattedDate,
          galleryUrl: `${appUrl}/gallery/${gallery.id}`,
        });
        reminded++;
      } catch (e) {
        console.error('[GALLERY_DELETION_REMINDER] email error:', e);
      }
    }

    console.log(`[GALLERY_DELETION_REMINDER] Sent ${reminded} of ${galleries.length} reminders`);
    return { reminded, total: galleries.length, expireDays, deleteDays };
  }
);

// Send payment reminders daily at 2 PM UTC — fallback for any milestones missed by event-driven scheduling
export const sendOverduePaymentReminders = inngest.createFunction(
  { id: 'send-overdue-payment-reminders' },
  { cron: '0 14 * * *' },
  async () => {
    const now = new Date();
    const todayUTCStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    // Only remind if never reminded or last reminder was sent more than 23 hours ago
    const reminderCutoff = new Date(now.getTime() - 23 * 3600 * 1000);

    const overdue = await prisma.paymentMilestone.findMany({
      where: {
        dueDate: { lt: tomorrow },
        status: { notIn: ['PAID', 'REFUNDED'] },
        invoice: { status: { notIn: ['PAID', 'CANCELLED'] } },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lt: reminderCutoff } },
        ],
      },
      include: {
        invoice: {
          include: {
            event: {
              include: {
                client: true,
                tenant: { include: { branding: true } },
              },
            },
          },
        },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
    const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'codemates@gmail.com';
    const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

    let sent = 0;
    let failed = 0;
    for (const ms of overdue) {
      const event = ms.invoice.event;
      if (!event) continue;
      const branding = event.tenant.branding;
      const companyName = branding?.companyName ?? event.tenant.name;
      const isOverdue = new Date(ms.dueDate).toISOString().split('T')[0] < todayUTCStr;
      try {
        await sendPaymentReminderEmail({
          to: event.client.email,
          firstName: event.client.firstName,
          companyName,
          invoiceNumber: ms.invoice.invoiceNumber,
          amountDueFormatted: fmt(ms.amountCents),
          dueDate: new Date(ms.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          portalUrl: `${appUrl}/portal/${event.portalToken}?tab=invoice`,
          isOverdue,
          replyTo: branding?.replyToEmail ?? undefined,
          from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
        });
        await prisma.paymentMilestone.update({
          where: { id: ms.id },
          data: { lastReminderSentAt: now },
        });
        sent++;
      } catch (e) {
        failed++;
        console.error('[OVERDUE_REMINDER] email error:', e);
        // Notify super admin of silent failures so they don't go undetected
        sendEmail(adminEmail, `[Booth Genius] Payment reminder failed — ${ms.invoice.invoiceNumber}`,
          `<p>Failed to send payment reminder for invoice <strong>${ms.invoice.invoiceNumber}</strong> (milestone: ${ms.label}, due: ${new Date(ms.dueDate).toLocaleDateString()}).</p><p>Error: ${String(e)}</p>`
        ).catch(() => {});
      }
    }

    console.log(`[OVERDUE_REMINDER] Sent ${sent}, failed ${failed}, of ${overdue.length} milestones`);
    return { sent, failed, total: overdue.length };
  }
);

// Event-driven: fires at the balance milestone's exact due date when the invoice is sent
export const notifyPaymentMilestoneDue = inngest.createFunction(
  { id: 'notify-payment-milestone-due', retries: 3 },
  { event: 'payment/milestone-due' },
  async ({ event: evt }) => {
    const { milestoneId } = evt.data as { milestoneId: string };
    const ms = await prisma.paymentMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        invoice: {
          include: {
            event: {
              include: {
                client: true,
                tenant: { include: { branding: true } },
              },
            },
          },
        },
      },
    });

    if (!ms) return;
    if (ms.status === 'PAID' || ms.status === 'REFUNDED') return;
    if (!ms.invoice.event) return;
    if (ms.invoice.status === 'PAID' || ms.invoice.status === 'CANCELLED') return;

    const event = ms.invoice.event;
    const branding = event.tenant.branding;
    const companyName = branding?.companyName ?? event.tenant.name;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
    const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

    await sendPaymentReminderEmail({
      to: event.client.email,
      firstName: event.client.firstName,
      companyName,
      invoiceNumber: ms.invoice.invoiceNumber,
      amountDueFormatted: fmt(ms.amountCents),
      dueDate: new Date(ms.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      portalUrl: `${appUrl}/portal/${event.portalToken}?tab=invoice`,
      isOverdue: false,
      replyTo: branding?.replyToEmail ?? undefined,
      from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
    });

    await prisma.paymentMilestone.update({
      where: { id: ms.id },
      data: { lastReminderSentAt: new Date() },
    });
  }
);

// Event-driven: fires at eventDate - 5 days when booking is confirmed.
// If the event is already within 5 days at booking time, this fires immediately.
export const notifyHostDesignDeadline = inngest.createFunction(
  { id: 'notify-host-design-deadline', retries: 3 },
  { event: 'design/approval-check' },
  async ({ event: evt }) => {
    const { eventId } = evt.data as { eventId: string };

    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        client: true,
        templateDesigns: { where: { status: 'APPROVED' }, take: 1 },
        tenant: {
          include: {
            branding: true,
            memberships: {
              where: { role: 'HOST_ADMIN', status: 'ACTIVE' },
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    });

    if (!ev) return;
    // Skip if cancelled or already past
    if (ev.status === 'CANCELLED') return;
    if (new Date(ev.eventDate) < new Date()) return;
    // Skip if design already approved
    if (ev.templateDesigns.length > 0) return;
    // Skip if reminder already sent
    if (ev.designReminderSentAt) return;

    const adminEmails = ev.tenant.memberships
      .map(m => m.user?.email)
      .filter((e): e is string => Boolean(e));
    const replyTo = ev.tenant.branding?.replyToEmail;
    const recipients = replyTo
      ? [replyTo, ...adminEmails.filter(e => e !== replyTo)]
      : adminEmails;
    if (recipients.length === 0) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const companyName = ev.tenant.branding?.companyName ?? ev.tenant.name;
    const clientName = `${ev.client.firstName} ${ev.client.lastName}`;
    const eventDateStr = new Date(ev.eventDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const msUntil = new Date(ev.eventDate).getTime() - Date.now();
    const daysUntil = Math.max(0, Math.floor(msUntil / 86400_000));

    await sendDesignApprovalReminderEmail({
      to: recipients,
      companyName,
      clientName,
      eventTitle: ev.title,
      eventDate: eventDateStr,
      daysUntilEvent: daysUntil,
      designUrl: `${appUrl}/events/${ev.id}/designs`,
    });

    await prisma.event.update({
      where: { id: ev.id },
      data: { designReminderSentAt: new Date() },
    });
  }
);

// Daily cron at 9 AM UTC — catches BOOKED events within 5 days with no approved design
// that were missed by event-driven scheduling (pre-existing bookings, rescheduled events, etc.)
export const sendDesignApprovalReminders = inngest.createFunction(
  { id: 'send-design-approval-reminders' },
  { cron: '0 9 * * *' },
  async () => {
    const now = new Date();
    const fiveDaysOut = new Date(now.getTime() + 5 * 86400_000);

    const events = await prisma.event.findMany({
      where: {
        status: { in: ['BOOKED', 'IN_PROGRESS'] },
        eventDate: { gte: now, lte: fiveDaysOut },
        designReminderSentAt: null,
        templateDesigns: { none: { status: 'APPROVED' } },
      },
      include: {
        client: true,
        tenant: {
          include: {
            branding: true,
            memberships: {
              where: { role: 'HOST_ADMIN', status: 'ACTIVE' },
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    let sent = 0;

    for (const ev of events) {
      const adminEmails = ev.tenant.memberships
        .map(m => m.user?.email)
        .filter((e): e is string => Boolean(e));
      const replyTo = ev.tenant.branding?.replyToEmail;
      const recipients = replyTo
        ? [replyTo, ...adminEmails.filter(e => e !== replyTo)]
        : adminEmails;
      if (recipients.length === 0) continue;

      const companyName = ev.tenant.branding?.companyName ?? ev.tenant.name;
      const clientName = `${ev.client.firstName} ${ev.client.lastName}`;
      const eventDateStr = new Date(ev.eventDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const daysUntil = Math.max(0, Math.floor((new Date(ev.eventDate).getTime() - now.getTime()) / 86400_000));

      try {
        await sendDesignApprovalReminderEmail({
          to: recipients,
          companyName,
          clientName,
          eventTitle: ev.title,
          eventDate: eventDateStr,
          daysUntilEvent: daysUntil,
          designUrl: `${appUrl}/events/${ev.id}/designs`,
        });
        await prisma.event.update({
          where: { id: ev.id },
          data: { designReminderSentAt: now },
        });
        sent++;
      } catch (e) {
        console.error('[DESIGN_REMINDER] email error:', e);
      }
    }

    console.log(`[DESIGN_REMINDER] Sent ${sent} of ${events.length} design approval reminders`);
    return { sent, total: events.length };
  }
);

// Daily cron at 1 AM UTC — auto-complete events whose date has passed
export const autoCompleteEvents = inngest.createFunction(
  { id: 'auto-complete-events' },
  { cron: '0 1 * * *' },
  async () => {
    const now = new Date();
    // Use start-of-today so events happening today are never auto-completed.
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const { count } = await prisma.event.updateMany({
      where: {
        status: { in: ['BOOKED', 'IN_PROGRESS'] },
        eventDate: { lt: todayStart },
      },
      data: { status: 'COMPLETED' },
    });
    console.log(`[AUTO_COMPLETE] Marked ${count} past events as COMPLETED`);
    return { completed: count };
  }
);
