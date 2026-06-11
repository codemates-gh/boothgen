
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';

export async function sendEmail(to: string, subject: string, html: string, reply_to?: string) {
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, reply_to });
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
