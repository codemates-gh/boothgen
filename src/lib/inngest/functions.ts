
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendDesignReadyEmail, sendDesignDecisionEmail } from '@/lib/email/send';
import { triggerAutomation, scheduleEventDateAutomations, executeAutomation } from './trigger';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export const processAutomation = inngest.createFunction(
  { id: 'process-automation', retries: 3 },
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
    const { count } = await prisma.leadMessage.deleteMany({ where: { sentAt: { lt: cutoff } } });
    console.log(`[PURGE] Deleted ${count} lead messages older than ${months} months`);
    return { deleted: count, months };
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
