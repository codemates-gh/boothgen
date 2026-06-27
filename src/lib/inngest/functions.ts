
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendDesignReadyEmail, sendDesignDecisionEmail, sendPaymentReminderEmail, sendGalleryDeletionReminderEmail } from '@/lib/email/send';
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

// Send overdue payment reminders daily at 2 PM UTC
export const sendOverduePaymentReminders = inngest.createFunction(
  { id: 'send-overdue-payment-reminders' },
  { cron: '0 14 * * *' },
  async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = await prisma.paymentMilestone.findMany({
      where: {
        dueDate: { lte: today },
        status: { notIn: ['PAID', 'REFUNDED'] },
        invoice: { status: { notIn: ['PAID', 'CANCELLED'] } },
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
    const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

    let sent = 0;
    for (const ms of overdue) {
      const event = ms.invoice.event;
      if (!event) continue;
      const branding = event.tenant.branding;
      const companyName = branding?.companyName ?? event.tenant.name;
      try {
        await sendPaymentReminderEmail({
          to: event.client.email,
          firstName: event.client.firstName,
          companyName,
          invoiceNumber: ms.invoice.invoiceNumber,
          amountDueFormatted: fmt(ms.amountCents),
          dueDate: new Date(ms.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          portalUrl: `${appUrl}/portal/${event.portalToken}?tab=invoice`,
          replyTo: branding?.replyToEmail ?? undefined,
          from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
        });
        sent++;
      } catch (e) {
        console.error('[OVERDUE_REMINDER] email error:', e);
      }
    }

    console.log(`[OVERDUE_REMINDER] Sent ${sent} of ${overdue.length} reminder emails`);
    return { sent, total: overdue.length };
  }
);
