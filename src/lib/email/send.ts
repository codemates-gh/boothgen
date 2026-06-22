
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

export async function sendPaymentConfirmationEmail(params: {
  to: string; firstName: string; companyName: string; invoiceNumber: string;
  amountPaidFormatted: string; eventTitle: string; portalUrl: string; replyTo?: string; from?: string;
}) {
  const { to, firstName, companyName, invoiceNumber, amountPaidFormatted, eventTitle, portalUrl, replyTo, from } = params;
  return sendEmail(
    to,
    `Payment Confirmed — ${invoiceNumber}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:20px;color:#111827">Hi ${firstName}, you're all set! 🎉</h2>
<p style="color:#374151">We've received your payment for <strong>${eventTitle}</strong>. Your booking is confirmed.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:24px 0">
  <p style="margin:0;color:#166534;font-weight:600;font-size:18px;">✓ ${amountPaidFormatted} received</p>
  <p style="margin:4px 0 0;color:#16a34a;font-size:14px;">Invoice ${invoiceNumber}</p>
</div>
<h3 style="font-size:16px;color:#111827;margin:28px 0 12px">What happens next</h3>
<table style="width:100%;border-collapse:collapse">
  <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;width:32px;font-size:20px">🎨</td><td style="padding:12px 0 12px 12px;border-bottom:1px solid #f3f4f6"><strong style="color:#111827">Template Design Review</strong><br/><span style="color:#6b7280;font-size:14px;">${companyName} will share your custom photo booth design and ask for your approval.</span></td></tr>
  <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:20px">📸</td><td style="padding:12px 0 12px 12px;border-bottom:1px solid #f3f4f6"><strong style="color:#111827">Your Event</strong><br/><span style="color:#6b7280;font-size:14px;">Sit back and enjoy! Your photo booth team will handle everything on the day.</span></td></tr>
  <tr><td style="padding:12px 0;vertical-align:top;font-size:20px">🖼️</td><td style="padding:12px 0 12px 12px"><strong style="color:#111827">Online Gallery</strong><br/><span style="color:#6b7280;font-size:14px;">Your event photos will be available to download from your client portal after the event.</span></td></tr>
</table>
<p style="margin:28px 0"><a href="${portalUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View Your Portal</a></p>
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">Questions? Reply to this email — we're happy to help.</p>
<p>Warm regards,<br/><strong>${companyName}</strong></p>
</div>`,
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
