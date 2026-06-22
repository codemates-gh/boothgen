
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';

export async function sendEmail(to: string, subject: string, html: string, reply_to?: string, from?: string) {
  try {
    const { data, error } = await resend.emails.send({ from: from ?? FROM, to, subject, html, reply_to });
    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL_SEND]', err);
    return { success: false, error: err };
  }
}

export async function sendContractLink(params: { to: string; firstName: string; companyName: string; contractTitle: string; portalUrl: string; expiresAt?: Date }) {
  const { to, firstName, companyName, contractTitle, portalUrl, expiresAt } = params;
  const exp = expiresAt ? '<p style="color:#6b7280;font-size:13px;">This link expires on ' + expiresAt.toLocaleDateString() + '.</p>' : '';
  return sendEmail(to, 'Please sign your contract: ' + contractTitle,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Hi ' + firstName + ',</h2>' +
    '<p>Your contract with ' + companyName + ' is ready to sign.</p>' +
    '<p><strong>' + contractTitle + '</strong></p>' +
    '<p style="margin:24px 0"><a href="' + portalUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; Sign Contract</a></p>' +
    exp + '<p style="color:#6b7280;font-size:12px;">If you did not expect this email, please ignore it.</p>' +
    '<p>Warm regards,<br/>' + companyName + '</p></div>'
  );
}

export async function sendInvoiceLink(params: { to: string; firstName: string; companyName: string; invoiceNumber: string; totalFormatted: string; portalUrl: string }) {
  const { to, firstName, companyName, invoiceNumber, totalFormatted, portalUrl } = params;
  return sendEmail(to, 'Invoice ' + invoiceNumber + ' from ' + companyName,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Hi ' + firstName + ',</h2>' +
    '<p>You have a new invoice from ' + companyName + '.</p>' +
    '<p><strong>Invoice ' + invoiceNumber + '</strong> &mdash; ' + totalFormatted + '</p>' +
    '<p style="margin:24px 0"><a href="' + portalUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View &amp; Pay Invoice</a></p>' +
    '<p>Warm regards,<br/>' + companyName + '</p></div>'
  );
}

export async function sendQuoteLink(params: {
  to: string; firstName: string; companyName: string; quoteNumber: string; totalFormatted: string; portalUrl: string; replyTo?: string; from?: string;
}) {
  const { to, firstName, companyName, quoteNumber, totalFormatted, portalUrl, replyTo, from } = params;
  return sendEmail(
    to,
    `Your Quote from ${companyName}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">` +
    `<h2 style="font-size:20px;color:#111827">Hi ${firstName},</h2>` +
    `<p>Your quote from <strong>${companyName}</strong> is ready to review.</p>` +
    `<p><strong>${quoteNumber}</strong> &mdash; ${totalFormatted}</p>` +
    `<p style="margin:24px 0"><a href="${portalUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; Accept Quote</a></p>` +
    `<p style="color:#6b7280;font-size:12px;">If you did not expect this email, please ignore it.</p>` +
    `<p>Warm regards,<br/>${companyName}</p></div>`,
    replyTo,
    from,
  );
}

export async function sendDesignReadyEmail(params: {
  to: string; firstName: string; companyName: string; version: number; portalUrl: string;
}) {
  const { to, firstName, companyName, version, portalUrl } = params;
  return sendEmail(
    to,
    'Your photo booth design is ready for review — ' + companyName,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Hi ' + firstName + ',</h2>' +
    '<p>' + companyName + ' has uploaded a new template design (version ' + version + ') for your event and would love your feedback.</p>' +
    '<p style="margin:24px 0"><a href="' + portalUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review Design</a></p>' +
    '<p style="color:#6b7280;font-size:13px;">You can approve the design or leave a note requesting changes. Your feedback helps us make everything perfect for your event.</p>' +
    '<p>Warm regards,<br/>' + companyName + '</p></div>'
  );
}

export async function sendDesignDecisionEmail(params: {
  to: string; clientName: string; eventTitle: string; version: number;
  decision: 'approved' | 'revision_requested'; revisionNote?: string; designUrl: string;
}) {
  const { to, clientName, eventTitle, version, decision, revisionNote, designUrl } = params;
  const isApproved = decision === 'approved';
  const subject = isApproved
    ? 'Design approved — ' + eventTitle
    : 'Revision requested — ' + eventTitle;
  const body = isApproved
    ? '<p><strong>' + clientName + '</strong> has approved template design version ' + version + ' for <strong>' + eventTitle + '</strong>.</p>'
    : '<p><strong>' + clientName + '</strong> has requested a revision on template design version ' + version + ' for <strong>' + eventTitle + '</strong>.</p>' +
      (revisionNote ? '<blockquote style="border-left:3px solid #F97316;margin:16px 0;padding:12px 16px;background:#fff7ed;color:#7c2d12;border-radius:0 8px 8px 0">' + revisionNote + '</blockquote>' : '') +
      '<p style="color:#6b7280;font-size:13px;">Upload a new version and submit it for approval when ready.</p>';
  return sendEmail(
    to,
    subject,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Design Update</h2>' +
    body +
    '<p style="margin:24px 0"><a href="' + designUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Dashboard</a></p>' +
    '</div>'
  );
}
