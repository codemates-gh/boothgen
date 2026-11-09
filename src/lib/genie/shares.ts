import { prisma } from '@/lib/prisma/client';
import { galleryUrl, sessionUrl } from './urls';
import { getMessagingConfig, sendTenantEmail, sendTenantSms, type SendResult } from './messaging';

export function renderMergeFields(template: string, fields: { firstName?: string | null; eventName: string; link: string }): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, fields.firstName?.trim() || 'there')
    .replace(/\{\{\s*eventName\s*\}\}/g, fields.eventName)
    .replace(/\{\{\s*link\s*\}\}/g, fields.link);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain-text body → simple HTML email; the link becomes a button-style anchor like the platform emails
export function shareEmailHtml(text: string, link: string, buttonColor = '#F97316'): string {
  const body = escapeHtml(text)
    .split(escapeHtml(link)).join(`<a href="${escapeHtml(link)}" style="color:${buttonColor}">${escapeHtml(link)}</a>`)
    .replace(/\n/g, '<br/>');
  return '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#374151">' +
    `<p>${body}</p>` +
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:${buttonColor};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View your photos</a></p>` +
    '</div>';
}

export type PreparedShare =
  | { ready: false; reason: string }
  | { ready: true; shareId: string; channel: 'sms' | 'email'; tenantId: string; to: string; subject: string; text: string; link: string; buttonColor?: string };

// Everything needed to send one queued share, or why it can't be sent yet
export async function prepareShare(shareId: string): Promise<PreparedShare> {
  const share = await prisma.genieShare.findUnique({
    where: { id: shareId },
    include: {
      session: { include: { gallery: { select: { clientToken: true } }, _count: { select: { assets: true } } } },
      event: { select: { title: true, genieSettings: true, tenant: { select: { branding: { select: { primaryColor: true } } } } } },
    },
  });
  if (!share) return { ready: false, reason: 'not_found' };
  if (share.status !== 'queued') return { ready: false, reason: 'already_' + share.status };
  if (share.session._count.assets === 0) return { ready: false, reason: 'no_photos_yet' };
  const settings = share.event.genieSettings;
  if (!settings) return { ready: false, reason: 'not_configured' };

  const link = settings.guestLinkScope === 'all'
    ? galleryUrl(share.session.gallery)
    : sessionUrl(share.session.gallery, share.session.publicToken);
  const fields = { firstName: share.firstName, eventName: share.event.title, link };
  const channel = share.channel === 'sms' ? 'sms' : 'email';
  return {
    ready: true,
    shareId: share.id,
    channel,
    tenantId: share.tenantId,
    to: share.destination,
    subject: renderMergeFields(settings.emailSubject, fields),
    text: renderMergeFields(channel === 'sms' ? settings.smsBody : settings.emailBody, fields),
    link,
    buttonColor: share.event.tenant.branding?.primaryColor,
  };
}

export async function deliverShare(p: Extract<PreparedShare, { ready: true }>): Promise<SendResult> {
  const config = await getMessagingConfig(p.tenantId);
  if (p.channel === 'sms') {
    // Consent is enforced when the share is accepted; re-check so a bad row can never text someone
    const share = await prisma.genieShare.findUnique({ where: { id: p.shareId }, select: { smsConsentAt: true } });
    if (!share?.smsConsentAt) return { ok: false, error: 'No SMS consent recorded', retryable: false };
    return sendTenantSms(config, p.to, p.text);
  }
  return sendTenantEmail(config, p.to, p.subject, shareEmailHtml(p.text, p.link, p.buttonColor), p.text);
}

export async function recordShareResult(shareId: string, result: SendResult) {
  if (result.ok) {
    await prisma.genieShare.updateMany({
      where: { id: shareId, status: 'queued' },
      data: { status: 'sent', sentAt: new Date(), providerMessageId: result.providerMessageId ?? null, error: null },
    });
  } else {
    await markShareFailed(shareId, result.error);
  }
}

export async function markShareFailed(shareId: string, error: string) {
  await prisma.genieShare.updateMany({ where: { id: shareId, status: 'queued' }, data: { status: 'failed', error: error.slice(0, 1000) } });
}

// Twilio MessageStatus → GenieShare.status; never moves backwards from delivered/failed
export async function applyTwilioStatus(tenantId: string, messageSid: string, messageStatus: string, errorCode?: string | null) {
  const share = await prisma.genieShare.findUnique({ where: { providerMessageId: messageSid } });
  if (!share || share.tenantId !== tenantId || share.channel !== 'sms') return false;
  if (messageStatus === 'delivered') {
    await prisma.genieShare.update({ where: { id: share.id }, data: { status: 'delivered', deliveredAt: new Date() } });
  } else if ((messageStatus === 'failed' || messageStatus === 'undelivered') && share.status !== 'delivered') {
    await prisma.genieShare.update({ where: { id: share.id }, data: { status: 'failed', error: `Twilio ${messageStatus}${errorCode ? ' (error ' + errorCode + ')' : ''}` } });
  }
  return true;
}
