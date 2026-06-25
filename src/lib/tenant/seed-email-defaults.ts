import { prisma } from '@/lib/prisma/client';

function shell(body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#111827">`
    + `<div style="padding:32px 32px 0">${body}</div>`
    + `<div style="margin:32px 0 0;padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">`
    + `<p style="color:#9ca3af;font-size:12px;margin:0">{{host.company_name}} · Sent via Booth Genius</p>`
    + `</div></div>`;
}

function btn(label: string, url: string): string {
  return `<p style="margin:28px 0"><a href="${url}" style="background:#F97316;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">${label}</a></p>`;
}

function sig(): string {
  return `<hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0"/><p style="font-size:13px;color:#374151;line-height:1.6">{{host.signature}}</p>`;
}

const DEFAULTS = [
  {
    name: 'default_New Inquiry Auto-Reply',
    trigger: 'LEAD_CREATED',
    subject: 'Thank you for your inquiry, {{client.first_name}}!',
    bodyHtml: shell(
      `<h2 style="font-size:22px;font-weight:700;margin:0 0 20px">Hi {{client.first_name}},</h2>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Thank you for reaching out to <strong>{{host.company_name}}</strong>! We've received your inquiry and are excited to learn more about your event.</p>`
      + `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin:24px 0">`
      + `<p style="margin:0 0 6px;font-size:14px;color:#9a3412;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Your Event Details</p>`
      + `<p style="margin:4px 0;font-size:15px;color:#111827"><strong>{{event.title}}</strong></p>`
      + `<p style="margin:4px 0;font-size:14px;color:#6b7280">{{event.date}}</p>`
      + `</div>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">We'll review your information and be in touch shortly to discuss availability, packages, and next steps.</p>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0">In the meantime, feel free to reply to this email with any questions — we'd love to hear from you!</p>`
      + sig()
    ),
  },
  {
    name: 'default_Your Quote is Ready',
    trigger: 'QUOTE_SENT',
    subject: 'Your quote for {{event.title}} is ready to review',
    bodyHtml: shell(
      `<h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Your quote is ready, {{client.first_name}}! 🎉</h2>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">We've prepared a custom quote for your event. Please review the details and let us know if you'd like to move forward.</p>`
      + `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:0 0 24px">`
      + `<p style="margin:0 0 6px;font-size:14px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Quote Summary</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Event:</strong> {{event.title}}</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Date:</strong> {{event.date}}</p>`
      + `<p style="margin:6px 0;font-size:18px;color:#F97316;font-weight:700"><strong>Total: {{quote.total}}</strong></p>`
      + `</div>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 4px">Click below to review the full quote details and accept when you're ready. Once accepted, we'll prepare your contract.</p>`
      + btn('Review &amp; Accept Quote', '{{portal.link}}')
      + `<p style="font-size:13px;color:#6b7280;margin:0">This quote link takes you to your secure client portal.</p>`
      + sig()
    ),
  },
  {
    name: 'default_Contract Ready to Sign',
    trigger: 'CONTRACT_SENT',
    subject: 'Your contract is ready — {{event.title}}',
    bodyHtml: shell(
      `<h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Your contract is ready, {{client.first_name}}!</h2>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">We're thrilled to be working with you! Your contract for <strong>{{event.title}}</strong> is ready for your review and signature.</p>`
      + `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:0 0 24px">`
      + `<p style="margin:0 0 6px;font-size:14px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Contract Details</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Event:</strong> {{event.title}}</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Date:</strong> {{event.date}}</p>`
      + `<p style="margin:6px 0;font-size:14px;color:#dc2626">Please sign by <strong>{{contract.expiry}}</strong></p>`
      + `</div>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 4px">Please read through the contract carefully and sign electronically when you're ready to confirm your booking.</p>`
      + btn('Review &amp; Sign Contract', '{{contract.link}}')
      + `<p style="font-size:13px;color:#6b7280;margin:0">Questions about any terms? Reply to this email — we're happy to walk you through it.</p>`
      + sig()
    ),
  },
  {
    name: 'default_Invoice Ready for Payment',
    trigger: 'INVOICE_SENT',
    subject: 'Invoice from {{host.company_name}} — {{invoice.balance_due}} due',
    bodyHtml: shell(
      `<h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Hi {{client.first_name}}, your invoice is ready!</h2>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">Your invoice for <strong>{{event.title}}</strong> is ready for payment. We accept secure online payment through your client portal.</p>`
      + `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:0 0 24px">`
      + `<p style="margin:0 0 6px;font-size:14px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Invoice Summary</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Invoice:</strong> {{invoice.number}}</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Event:</strong> {{event.title}}</p>`
      + `<p style="margin:6px 0;font-size:15px;color:#111827"><strong>Event Date:</strong> {{event.date}}</p>`
      + `<p style="margin:10px 0 0;font-size:20px;color:#F97316;font-weight:700">Amount Due: {{invoice.balance_due}}</p>`
      + `</div>`
      + btn('View &amp; Pay Invoice', '{{portal.link}}')
      + `<p style="font-size:13px;color:#6b7280;margin:0">Payment is processed securely through your client portal. Questions? Reply to this email.</p>`
      + sig()
    ),
  },
  {
    name: "default_You're Booked! — What Happens Next",
    trigger: 'PAYMENT_RECEIVED',
    subject: "You're officially booked! 🎉 — {{event.title}}",
    bodyHtml: shell(
      `<h2 style="font-size:24px;font-weight:700;margin:0 0 8px">Congratulations, {{client.first_name}}! 🎉</h2>`
      + `<p style="font-size:16px;line-height:1.7;color:#374151;margin:0 0 24px">You're officially booked with <strong>{{host.company_name}}</strong>! We've received your payment and can't wait to make your event unforgettable.</p>`
      + `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:0 0 28px">`
      + `<p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#166534">✓ Payment Confirmed</p>`
      + `<p style="margin:4px 0;font-size:15px;color:#166534">{{invoice.total}} received for {{event.title}}</p>`
      + `<p style="margin:4px 0;font-size:14px;color:#16a34a">{{event.date}}</p>`
      + `</div>`
      + `<h3 style="font-size:17px;font-weight:700;color:#111827;margin:0 0 16px">What happens next</h3>`
      + `<table style="width:100%;border-collapse:collapse;margin:0 0 24px">`
      + `<tr><td style="width:36px;vertical-align:top;padding:12px 0;border-bottom:1px solid #f3f4f6;font-size:22px">🎨</td><td style="padding:12px 0 12px 14px;border-bottom:1px solid #f3f4f6"><strong style="font-size:15px;color:#111827">Custom Template Design</strong><br/><span style="font-size:14px;color:#6b7280;line-height:1.6">We'll reach out to start working on your personalized photo booth template. You'll receive a design for review and approval before your event — we want it to be perfect for you.</span></td></tr>`
      + `<tr><td style="vertical-align:top;padding:12px 0;border-bottom:1px solid #f3f4f6;font-size:22px">✅</td><td style="padding:12px 0 12px 14px;border-bottom:1px solid #f3f4f6"><strong style="font-size:15px;color:#111827">Design Approval</strong><br/><span style="font-size:14px;color:#6b7280;line-height:1.6">Review and approve your template design through your client portal. We'll make any revisions until you're 100% happy with it.</span></td></tr>`
      + `<tr><td style="vertical-align:top;padding:12px 0;border-bottom:1px solid #f3f4f6;font-size:22px">📸</td><td style="padding:12px 0 12px 14px;border-bottom:1px solid #f3f4f6"><strong style="font-size:15px;color:#111827">Your Event Day</strong><br/><span style="font-size:14px;color:#6b7280;line-height:1.6">Our team will arrive early to set up and ensure everything is ready. Sit back, enjoy your event, and let your guests have a blast in the photo booth!</span></td></tr>`
      + `<tr><td style="vertical-align:top;padding:12px 0;font-size:22px">🖼️</td><td style="padding:12px 0 12px 14px"><strong style="font-size:15px;color:#111827">Online Gallery</strong><br/><span style="font-size:14px;color:#6b7280;line-height:1.6">After the event, your photos will be published to your private online gallery for viewing, downloading, and sharing with friends and family.</span></td></tr>`
      + `</table>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 4px">You can always access your booking details, view your contract, and check updates from your client portal.</p>`
      + btn('View Your Client Portal', '{{portal.link}}')
      + `<p style="font-size:14px;color:#374151;margin:0">Questions or special requests before the big day? Just reply to this email — we're here to help!</p>`
      + sig()
    ),
  },
  {
    name: 'default_Your Photo Gallery is Ready',
    trigger: 'GALLERY_PUBLISHED',
    subject: 'Your photos from {{event.title}} are ready! 📸',
    bodyHtml: shell(
      `<h2 style="font-size:22px;font-weight:700;margin:0 0 8px">Your photos are ready, {{client.first_name}}! 📸</h2>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px"><strong>{{host.company_name}}</strong> has published your private online gallery from <strong>{{event.title}}</strong>. Your photos are waiting!</p>`
      + `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:0 0 24px">`
      + `<p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1e40af">🖼️ Your Gallery is Live</p>`
      + `<p style="margin:0;font-size:14px;color:#1d4ed8">View, download, and share all your photos from your client portal.</p>`
      + `</div>`
      + `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 4px">Browse your gallery, download your favorite shots in full resolution, and share the memories with everyone who was there.</p>`
      + btn('View Your Gallery', '{{portal.link}}')
      + `<p style="font-size:14px;color:#374151;margin:0">We hope you had an amazing event! We'd love to work with you again — it was our pleasure. 🙌</p>`
      + sig()
    ),
  },
];

export async function seedTenantEmailDefaults(tenantId: string): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const tpl of DEFAULTS) {
    // Rename old template if it exists without the default_ prefix
    const oldName = tpl.name.replace(/^default_/, '');
    if (oldName !== tpl.name) {
      const oldTemplate = await prisma.emailTemplate.findFirst({
        where: { tenantId, name: oldName },
      });
      if (oldTemplate) {
        await prisma.emailTemplate.update({ where: { id: oldTemplate.id }, data: { name: tpl.name } });
        await prisma.automationRule.updateMany({ where: { tenantId, name: oldName }, data: { name: tpl.name } });
        skipped.push(tpl.name + ' (renamed)');
        continue;
      }
    }

    // Skip if a template with this name already exists for the tenant
    const existingTemplate = await prisma.emailTemplate.findFirst({
      where: { tenantId, name: tpl.name },
    });
    if (existingTemplate) {
      skipped.push(tpl.name);
      continue;
    }

    // Create the email template
    const emailTemplate = await prisma.emailTemplate.create({
      data: { tenantId, name: tpl.name, subject: tpl.subject, bodyHtml: tpl.bodyHtml },
    });

    // Create the automation rule (skip if trigger already has an active rule)
    const existingRule = await prisma.automationRule.findFirst({
      where: { tenantId, trigger: tpl.trigger as any, isActive: true },
    });
    if (!existingRule) {
      await prisma.automationRule.create({
        data: {
          tenantId,
          name: tpl.name,
          trigger: tpl.trigger as any,
          actionType: 'EMAIL',
          emailTemplateId: emailTemplate.id,
          isActive: true,
          triggerOffsetHours: 0,
        },
      });
    }

    created.push(tpl.name);
  }

  return { created, skipped };
}
