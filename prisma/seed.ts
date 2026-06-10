
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Tenant 1 — Pixel Perfect Photo Booths
  const t1 = await prisma.tenant.upsert({
    where: { slug: 'pixel-perfect' },
    update: {},
    create: {
      name: 'Pixel Perfect Photo Booths',
      slug: 'pixel-perfect',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: {
        create: {
          companyName: 'Pixel Perfect Photo Booths',
          primaryColor: '#F97316',
          secondaryColor: '#EA6100',
          replyToEmail: 'hello@pixelperfect.example',
          supportPhone: '(512) 555-0101',
          websiteUrl: 'https://pixelperfect.example',
          invoiceFooterText: 'Thank you for choosing Pixel Perfect Photo Booths!',
        },
      },
    },
  });

  // Tenant 2 — Flash Frame Events
  const t2 = await prisma.tenant.upsert({
    where: { slug: 'flash-frame' },
    update: {},
    create: {
      name: 'Flash Frame Events',
      slug: 'flash-frame',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: {
        create: {
          companyName: 'Flash Frame Events',
          primaryColor: '#8B5CF6',
          secondaryColor: '#7C3AED',
          replyToEmail: 'hello@flashframe.example',
          supportPhone: '(512) 555-0202',
        },
      },
    },
  });

  // Default contract template for Tenant 1
  await prisma.contractTemplate.upsert({
    where: { id: 'seed-ct-1' },
    update: {},
    create: {
      id: 'seed-ct-1',
      tenantId: t1.id,
      name: 'Standard Event Agreement',
      isDefault: true,
      bodyHtml: `<h2>EVENT SERVICES AGREEMENT</h2>
<p>This Agreement is entered into between {{host.company_name}} ("Company") and {{client.full_name}} ("Client").</p>
<h3>1. Event Details</h3>
<p>Event: {{event.title}}<br/>Date: {{event.date}}<br/>Venue: {{event.venue_name}}</p>
<h3>2. Services</h3>
<p>Company agrees to provide photo booth services as described in the package: {{event.package_name}}.</p>
<h3>3. Payment</h3>
<p>Total: {{invoice.total}}<br/>Retainer due at signing: {{invoice.retainer_amount}}<br/>Balance due: {{invoice.balance_due}}</p>
<h3>4. Cancellation Policy</h3>
<p>Cancellations made more than 30 days before the event date will forfeit the retainer. Cancellations within 30 days are subject to 50% of the total contract value.</p>
<h3>5. Agreement</h3>
<p>By signing below, both parties agree to the terms outlined in this agreement.</p>`,
    },
  });

  // Default automation rules for Tenant 1
  const emailTpl = await prisma.emailTemplate.upsert({
    where: { id: 'seed-et-1' },
    update: {},
    create: {
      id: 'seed-et-1',
      tenantId: t1.id,
      name: 'New Lead — Auto Reply',
      subject: 'Thanks for reaching out, {{client.first_name}}!',
      bodyHtml: `<p>Hi {{client.first_name}},</p>
<p>Thank you for your interest in {{host.company_name}}! We received your inquiry for {{event.date}} and will be in touch within 1 business day.</p>
<p>Warm regards,<br/>{{host.company_name}}</p>`,
    },
  });

  await prisma.automationRule.upsert({
    where: { id: 'seed-ar-1' },
    update: {},
    create: {
      id: 'seed-ar-1',
      tenantId: t1.id,
      name: 'New Lead Auto-Reply',
      trigger: 'LEAD_CREATED',
      triggerOffsetHours: 0,
      actionType: 'EMAIL',
      emailTemplateId: emailTpl.id,
      isActive: true,
    },
  });

  // Sample client + event for Tenant 1
  const client1 = await prisma.client.upsert({
    where: { tenantId_email: { tenantId: t1.id, email: 'sarah.johnson@example.com' } },
    update: {},
    create: {
      tenantId: t1.id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@example.com',
      phone: '(512) 555-1234',
      city: 'Austin',
      state: 'TX',
    },
  });

  const event1 = await prisma.event.upsert({
    where: { id: 'seed-ev-1' },
    update: {},
    create: {
      id: 'seed-ev-1',
      tenantId: t1.id,
      clientId: client1.id,
      title: 'Johnson Wedding',
      status: 'BOOKED',
      eventDate: new Date(Date.now() + 30 * 86400000),
      startTime: new Date(Date.now() + 30 * 86400000 + 18 * 3600000),
      endTime: new Date(Date.now() + 30 * 86400000 + 22 * 3600000),
      venueName: 'The Driskill Hotel',
      venueAddress: '604 Brazos St',
      venueCity: 'Austin',
      venueState: 'TX',
      packageName: 'Deluxe 4-Hour Package',
      guestCount: 200,
    },
  });

  await prisma.invoice.upsert({
    where: { tenantId_invoiceNumber: { tenantId: t1.id, invoiceNumber: 'INV-2025-0001' } },
    update: {},
    create: {
      tenantId: t1.id,
      clientId: client1.id,
      eventId: event1.id,
      invoiceNumber: 'INV-2025-0001',
      status: 'PARTIALLY_PAID',
      totalCents: 150000,
      subtotalCents: 150000,
      retainerPercent: 25,
      retainerAmountCents: 37500,
      retainerPaidAt: new Date(),
      amountPaidCents: 37500,
      balanceDueCents: 112500,
      dueDate: new Date(Date.now() + 25 * 86400000),
      lineItems: {
        create: [
          { description: 'Deluxe 4-Hour Photo Booth Package', quantity: 1, unitCents: 120000, totalCents: 120000, sortOrder: 0 },
          { description: 'Custom Overlay Design (3 designs)', quantity: 1, unitCents: 20000, totalCents: 20000, sortOrder: 1 },
          { description: 'Extra Prints Bundle (100 prints)', quantity: 1, unitCents: 10000, totalCents: 10000, sortOrder: 2 },
        ],
      },
    },
  });

  console.log('Seed complete.');
  console.log('NOTE: To make yourself a Super Admin, sign up via Clerk,');
  console.log('      then run: UPDATE users SET global_role=\'SUPER_ADMIN\' WHERE email=\'your@email.com\';');
}

main().catch(console.error).finally(() => prisma.$disconnect());
