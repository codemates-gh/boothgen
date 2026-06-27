import type { Metadata } from 'next';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { SupportSearch } from './SupportSearch';
import { SupportChat } from './SupportChat';
import { prisma } from '@/lib/prisma/client';

export const metadata: Metadata = {
  title: 'Support Center',
  description: 'Help guides, feature documentation, and step-by-step workflows for Booth Genius — the photo booth business platform.',
  alternates: { canonical: 'https://boothgen.com/support' },
  openGraph: {
    title: 'Booth Genius Support Center',
    description: 'Help guides, feature documentation, and step-by-step workflows for Booth Genius.',
    url: 'https://boothgen.com/support',
    images: [{ url: '/api/og?title=Support+Center&subtitle=Guides+and+documentation+for+Booth+Genius', width: 1200, height: 630, alt: 'Booth Genius Support Center' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Booth Genius Support Center',
    description: 'Help guides and documentation for Booth Genius.',
    images: ['/api/og?title=Support+Center&subtitle=Guides+and+documentation+for+Booth+Genius'],
  },
};

export const ARTICLES = [
  // ─── GETTING STARTED ────────────────────────────────────────────────────────
  {
    id: 'onboarding-overview',
    category: 'Getting Started',
    categoryIcon: '🚀',
    title: 'Setting Up Your Booth Genius Account',
    slug: 'getting-started',
    content: `Follow these steps after creating your account to get fully set up in under 30 minutes.

**Step 1 — Onboarding Wizard**
When you first sign in, you'll be guided through a short onboarding flow asking for your business name and time zone. Complete this to unlock your dashboard.

**Step 2 — Set Up Your Branding**
Go to Settings → Branding. Upload your business logo (PNG or JPG, recommended 400×120px horizontal), choose your primary brand color, and fill in your company name, reply-to email address, support phone number, and website URL. Everything clients see — emails, portal, invoices — will carry your brand, not Booth Genius.

**Step 3 — Connect Stripe**
Go to Settings → Billing → Connect Stripe. You'll be redirected to Stripe's secure onboarding flow. If you already have a Stripe account, just log in — it links your existing account, no new account needed. This step is separate from any Booth Genius subscription payment; it's what routes your clients' payments directly to your bank. Booth Genius never holds your money. Required before clients can pay invoices online.

**Step 4 — Add Your Service Packages**
Go to Settings → Packages. Create packages for your common booth rental options (e.g. "3-Hour Booth — $800", "4-Hour Booth — $1,000"). These populate as quick-add buttons when building quotes, so you don't have to re-type services for every booking.

**Step 5 — Create a Contract Template**
Go to Settings → Contracts → Templates. Create at least one contract template using merge tags like {{client_name}}, {{event_date}}, {{total_amount}}, {{venue_name}}. This template auto-populates when a client accepts a quote and signs digitally.

**Step 6 — Set Up Lead Capture**
Go to Settings → Lead Capture (Embed tab). Copy the JavaScript snippet and paste it into your website's HTML — typically in the footer or on a Contact/Book Now page. When a visitor submits the form, a lead will appear automatically in your Booth Genius dashboard. To prevent leads from requesting dates you can't cover, use Calendar → Block Dates to mark unavailable days before going live.

**Step 7 — Review Your Default Email Templates**
Your account comes with six pre-built email templates and automation rules that cover every major client touchpoint — inquiry auto-reply, quote notification, contract, invoice, booking confirmation, and gallery delivery. Go to Email Templates in the sidebar to preview and customize the wording for each one. Go to Automation to see and adjust the rules that fire them.

**Step 8 — Do a Test Run**
Create a test event manually (Events → New Event), build a quote, send it to your own email, open the portal link, accept the quote, sign the contract, and pay a $1 test invoice. This gives you the exact client experience before your first real booking.`,
  },
  {
    id: 'onboarding-branding',
    category: 'Getting Started',
    categoryIcon: '🚀',
    title: 'Customizing Your Brand & Portal Appearance',
    slug: 'branding',
    content: `Your client portal and all outgoing emails use your branding — never Booth Genius's.

**Logo**
Upload from Settings → Branding → Logo. Appears in your client portal header and outgoing emails. Recommended: horizontal format, transparent PNG background, at least 400px wide.

**Primary Color**
Pick a hex color that matches your brand. This color is used for buttons, active tabs, and accent elements in the client portal and email header.

**Company Name**
Displayed in the portal header and email sender name (e.g. "My Booth Co."). If blank, falls back to your account name.

**Reply-To Email**
When clients reply to your automated emails, replies go to this address — not a generic system address.

**Invoice Footer Text**
Add custom text at the bottom of invoices — useful for thank-you notes, payment terms, or cancellation policy reminders.

**Email Header HTML**
Add a custom HTML banner to the top of all outgoing emails for more advanced branding.

**Default Deposit % & Payment Timing**
Set your default deposit percentage (applied automatically when building new quotes), how many days before the event the balance is due, and a "full payment window" (if the event is within X days, full payment is required upfront instead of a deposit).`,
  },

  // ─── LEADS ──────────────────────────────────────────────────────────────────
  {
    id: 'leads-overview',
    category: 'Leads',
    categoryIcon: '📥',
    title: 'Managing Leads & Inquiries',
    slug: 'leads',
    content: `Leads are potential clients who have expressed interest. Booth Genius tracks every lead from first contact through booking.

**How Leads Come In**
1. **Embed Form** — A visitor fills out your inquiry form embedded on your website. A lead is automatically created, and you receive an email notification.
2. **Manual Entry** — Go to Leads → New Lead to manually add an inquiry (useful for phone calls, DMs, or referrals).

**Lead Statuses**
- **NEW** — Just received, not yet responded to
- **CONTACTED** — You've reached out
- **QUOTED** — A quote has been sent
- **CONVERTED** — The lead became a booked event
- **CLOSED/LOST** — The lead went cold or booked elsewhere

**Responding to a Lead**
Open a lead to see the inquiry details — event date, event type, venue, guest count, hours needed, and any additional message. Use the message thread to send replies. Your reply goes to the client's email, and their response comes back into the thread. Message threads are retained for **[[message_retention_months]] months** after the event date (for leads converted to events) or after the message date (for unconverted leads). A booking made a year in advance won't be purged until [[message_retention_months]] months after the event actually takes place.

**Converting to an Event**
Click "Convert to Event" on any lead. Booth Genius creates a new Event and Client record pre-filled with the lead's information. From there you can create a quote immediately.

**Lead Form Fields**
Customize which fields appear on your embedded inquiry form in Settings → Lead Capture. Toggle fields like venue, guest count, and hours to match what's most relevant to your business.`,
  },

  // ─── QUOTES ─────────────────────────────────────────────────────────────────
  {
    id: 'quotes-overview',
    category: 'Quotes & Proposals',
    categoryIcon: '📄',
    title: 'Creating & Sending Quotes',
    slug: 'quotes',
    content: `A quote is a professional proposal sent to a client before they book. Once accepted with a digital signature, it converts to a contract.

**Creating a Quote**
From an Event detail page, click "New Quote" (or go to Quotes → New Quote and select the event). You'll see:
- **Packages** — quick-add buttons for your saved service packages
- **Line Items** — add individual services with quantity and unit price
- **Tax Rate** — optional percentage applied to the subtotal
- **Discount** — apply a % or $ discount, or select a saved Coupon code
- **Payment Schedule** — Full payment (100% due now) or Deposit + Balance (set deposit %, balance due before event)
- **Contract Template** — choose which contract auto-generates on acceptance
- **Valid Until** — date after which the quote expires
- **Notes & Terms** — visible to the client in their portal

**Sending a Quote**
Click "Send Quote." The client receives an email with a portal link. The email includes a summary of what was quoted.

**What the Client Sees**
The client opens their portal and sees the Quote tab first. They can review all line items, totals, deposit amount due, and your notes. To accept, they type their full name in a signature field and click "Accept Quote." They're then guided to sign the contract immediately.

**Quote Statuses**
DRAFT → SENT → VIEWED → ACCEPTED or DECLINED

**Revising a Quote**
After sending, open the quote and click "Revise Quote." This resets it to Draft so you can edit and re-send. The client will need to re-accept the updated version.

**Discounts & Coupons**
Click "Add discount or coupon" in the line items area. Choose:
- **%** — percentage off the subtotal (e.g. 15% for a referral discount)
- **$** — fixed dollar amount off
- **Coupon Code** — select a pre-created code from Settings → Coupons

The discount appears as a clearly labeled line on the client's quote.`,
  },

  // ─── CONTRACTS ──────────────────────────────────────────────────────────────
  {
    id: 'contracts-overview',
    category: 'Contracts & Signatures',
    categoryIcon: '✍️',
    title: 'Digital Contracts & E-Signatures',
    slug: 'contracts',
    content: `Booth Genius includes built-in digital contracts — no DocuSign or HelloSign required.

**How It Works**
1. You create a contract template in Settings → Contracts → Templates
2. When a client accepts a quote, the contract auto-generates using merge tags from the event and quote data
3. The client is prompted to sign digitally in the same portal session, immediately after accepting the quote
4. You (the operator) countersign from your dashboard (Events → [Event] → Contract tab, or Contracts in the sidebar)
5. Both parties receive a signed copy via email

**Merge Tags**
Use these placeholders in your contract template — they're replaced automatically with real data:
- {{client_name}} — Full name of the client
- {{client_email}} — Client's email address
- {{event_date}} — Date of the event
- {{event_title}} — Name/title of the event
- {{venue_name}} — Event venue
- {{total_amount}} — Full contract amount
- {{deposit_amount}} — Deposit due
- {{balance_amount}} — Remaining balance
- {{operator_name}} — Your business name
- {{quote_number}} — Quote reference number

**Digital Signature**
The client types their full legal name in a signature field. The system records their IP address, browser info, and timestamp as part of the legal signing record — this is admissible as a binding digital signature in most jurisdictions (check with your local laws for events requiring notarized contracts).

**Saving a Signed Contract**
Once both parties have signed, the contract status changes to SIGNED. The PDF is accessible from the event detail and from the Contracts section in the sidebar.

**Multiple Templates**
Create different templates for corporate events, weddings, school events, etc. When building a quote, choose which template to use for that booking.`,
  },

  // ─── INVOICING ──────────────────────────────────────────────────────────────
  {
    id: 'invoicing-overview',
    category: 'Invoicing & Payments',
    categoryIcon: '💳',
    title: 'Invoices, Deposits & Online Payments',
    slug: 'invoicing',
    content: `Booth Genius handles the full payment lifecycle — deposits, milestones, balances, and card processing via Stripe.

**How Invoices Are Created**
When a client accepts a quote, an invoice is automatically generated with the line items, tax, and discount from the quote. You can also create a standalone invoice manually from Invoices → New Invoice.

**Payment Schedules (Milestones)**
- **Full Payment** — Client pays 100% at booking
- **Deposit + Balance** — Client pays the deposit % immediately, with the balance due a set number of days before the event (configured in Settings → Branding)

**Stripe Connect**
Clients pay via credit or debit card using Stripe. The card processing UI appears directly in the client portal's Invoice tab. Funds are deposited to your connected Stripe account, minus Stripe's processing fee (~2.9% + $0.30 per transaction).

**Platform Commission (Commission Plan only)**
If you're on the free Commission Plan, a small percentage is automatically deducted from each payment. Upgrade to the Pro Plan to eliminate all commissions.

**Invoice Statuses**
- DRAFT — Not yet sent
- SENT — Sent to client, awaiting payment
- PARTIALLY_PAID — Deposit received, balance outstanding
- PAID — Fully paid
- OVERDUE — Balance due date has passed without full payment

**Gallery Lock**
If a client has an overdue balance and a gallery exists, the gallery will be locked in their portal with a "Pay balance to unlock" prompt. Once the balance is paid, the gallery unlocks automatically.

**Recording Manual Payments**
If a client pays by cash, check, or Venmo outside of Stripe, you can record the payment manually from the invoice detail page. Mark the amount and payment method — the invoice status will update accordingly.

**Refunds**
Process refunds from your Stripe dashboard directly. Booth Genius does not currently support one-click refunds from the platform.`,
  },

  // ─── CLIENT PORTAL ──────────────────────────────────────────────────────────
  {
    id: 'portal-overview',
    category: 'Client Portal',
    categoryIcon: '🖼️',
    title: 'The Client Portal — Your Client\'s Home Base',
    slug: 'client-portal',
    content: `The client portal is a branded, mobile-friendly web page where clients access everything related to their event — quote, contract, invoice, design, and gallery — all in one link.

**How Clients Access It**
Each event has a unique portal link (e.g. boothgen.com/portal/abc123). This link is included automatically in quote emails, contract emails, and invoice reminders. Clients do NOT need to create an account — the link itself authenticates them.

**Portal Tabs**
The portal has up to 5 tabs depending on what's available for the event:
1. **Quote ✅** — View quote details, accept with digital signature
2. **Contract ✅** — Review and sign the contract
3. **Invoice 💳** — View payment breakdown, make deposits and balance payments via card
4. **Design 🎨** — Review booth template designs, approve or request revisions
5. **Gallery 📸** — View and download event photos (Pro feature)

**Tab Completion Indicators**
Each tab shows a ✅ once the action is completed (quote accepted, contract signed, invoice paid). This helps clients know where they are in the process.

**Security — Keep the Portal Link Private**
The portal link contains financial and payment information. Advise clients NOT to forward the portal link to wedding guests, family members, or vendors. For sharing event photos with guests, use the separate Guest Gallery Link instead.

**Mobile Experience**
The portal is fully responsive. Clients can accept quotes, sign contracts, and pay invoices from a smartphone without downloading any app.

**What Happens After Each Step**
- Quote accepted → Contract auto-generates, client is prompted to sign immediately
- Contract signed → Invoice tab becomes active for payment
- Deposit paid → Confirmation email sent, balance schedule set
- Balance paid → Gallery unlocks (if applicable)`,
  },

  // ─── GALLERY ────────────────────────────────────────────────────────────────
  {
    id: 'gallery-overview',
    category: 'Photo Gallery (Pro)',
    categoryIcon: '📸',
    title: 'Photo Gallery Delivery',
    slug: 'gallery',
    content: `The Photo Gallery feature lets you deliver event photos directly through Booth Genius — no separate photo delivery subscription required. Gallery is available on the Pro plan only.

**Uploading Photos**
From an event detail page, go to the Gallery tab. Click "Upload Photos" to bulk-upload JPG or PNG files. Photos are stored securely in cloud storage and displayed in the client portal immediately after upload.

**Publishing the Gallery**
After uploading, toggle the gallery to "Published" to make it visible to the client in their portal. You can keep it in Draft while curating the selection.

**Access Code (Optional)**
Add an optional access code to the gallery if you want clients to verify their identity before viewing photos. The client enters the code in the portal gallery tab to unlock.

**Sharing with Guests — Guest Gallery Link**
The client's portal link contains payment information and should NOT be shared with guests. Instead:
1. From the gallery management page or client portal, click "Share Gallery Link"
2. This copies a separate public URL: boothgen.com/g/[token]
3. This guest link shows ONLY the photos — no invoice, quote, or payment details visible

Tell clients: "Share THIS link with your guests — your private portal stays private."

**Gallery Expiration**
Galleries expire **[[gallery_expire_days]] days** after the event date — the gallery is hidden from the client portal after this point. Photos then enter a deletion buffer and are permanently deleted **[[gallery_delete_days]] days** after expiry. You and the client will both receive a warning email before permanent deletion.

**Balance Lock**
If the invoice has an overdue balance, the gallery tab is locked with a "Pay to unlock" message. Once the balance is paid, the gallery unlocks automatically — a great natural incentive for clients to pay the balance.

**Photo Count**
The gallery tab in the portal shows the total photo count and a photo grid with a lightbox viewer. Clients can click any photo to view full-size and download individually, or click "Download All" to get a ZIP archive.`,
  },

  // ─── TEAM ───────────────────────────────────────────────────────────────────
  {
    id: 'team-overview',
    category: 'Team Management',
    categoryIcon: '👥',
    title: 'Inviting & Managing Team Members',
    slug: 'team',
    content: `Add staff, assistants, or co-operators to your account without giving them full admin access.

**Inviting a Team Member**
Go to Settings → Team → Invite Team Member. Enter their name and email address. They'll receive an invitation email with a link to set up their account (create a password and log in). The invite link expires after 48 hours — resend from the Team page if needed.

**Team Member vs. Operator Admin Roles**
- **Operator Admin** — Full access to all features, settings, billing, and financial data
- **Team Member** — Limited access controlled by you; cannot see Settings, Billing, or other sensitive areas unless explicitly allowed

**Controlling What Team Members Can See**
Go to Settings → Team → Team Member Access. Toggle which sections team members can access:
- Events — View and manage assigned events
- Calendar — View the event calendar
- Leads & Messages — View and respond to leads
- Quotes — View quote details (read-only)
- Invoices — View invoice details (read-only)
- Clients — View client records
- Gallery — Access photo galleries (Pro only)

These settings apply to ALL team members on your account. Changes take effect on the team member's next login.

**What Team Members Cannot Do**
Regardless of access settings, team members can never:
- Access Settings, Branding, Billing, or Packages
- Create, edit, or delete service packages
- View platform commission settings
- Manage coupon codes
- Invite other team members

**Removing a Team Member**
From the Team Members table, click on a member and change their status to Suspended. They will no longer be able to log in.`,
  },

  // ─── AUTOMATION ─────────────────────────────────────────────────────────────
  {
    id: 'automation-overview',
    category: 'Automation & Emails',
    categoryIcon: '⚡',
    title: 'Setting Up Automated Email Sequences',
    slug: 'automation',
    content: `Automation lets you send the right email at exactly the right moment — without manual follow-up for every booking.

**How It Works**
Go to Automation in the sidebar. Each rule has:
1. **Trigger** — The moment in the booking flow that fires the email
2. **Delay** — Send immediately, or wait a set number of hours after the trigger
3. **Email Template** — The message to send (create and edit templates in Email Templates)

**Default Templates — Ready on Day One**
Every new account comes pre-loaded with six email templates and matching automation rules so your clients start receiving professional emails from your first booking:
- New Inquiry Auto-Reply (fires on Lead Created)
- Your Quote is Ready (fires on Quote Sent)
- Contract Ready to Sign (fires on Contract Sent)
- Invoice Ready for Payment (fires on Invoice Sent)
- You're Booked! — What Happens Next (fires after payment is received)
- Your Photo Gallery is Ready (fires when gallery is published)

These are fully editable. Customize the wording, subject line, and layout to match your brand — or delete and rebuild from scratch.

**Automation-First: Your Template Takes Over**
When an active automation rule covers a trigger, your custom template is the only email the client receives — the system's built-in fallback is automatically suppressed. If you disable or delete your rule, the built-in email returns as a fallback so no client communication is ever silently dropped.

**Available Triggers**
- Lead Created — New inquiry submitted through your lead form
- Quote Sent — You clicked "Send Quote"
- Quote Accepted — Client accepted the quote
- Contract Sent — You sent the contract for signature
- Contract Signed — Client signed; waiting on your countersignature
- Invoice Sent — Invoice was sent to the client
- Payment Received — Client completed payment (full payment or final milestone)
- 14 Days Before Event — Countdown reminder
- 7 Days Before Event — Countdown reminder
- 1 Day Before Event — Final reminder
- 1 Day After Event — Follow-up (e.g. review request)
- 3 Days After Event — Follow-up
- Gallery Published — You published the client's photo gallery

**Editing a Rule**
Click the pencil icon on any rule to edit the name, trigger, or assigned template without deleting and recreating it. Toggle the switch to pause a rule temporarily.

**Email Templates & the Visual Editor**
Go to Email Templates in the sidebar. Create a new template or click any existing one to edit. The visual editor lets you type and format your message and insert merge tags using the tag picker — click a tag to insert it at the cursor. Tags appear as orange chips while editing and are replaced with real values when the email is sent.

**Available Merge Tags**
- {{client.first_name}} / {{client.last_name}} / {{client.full_name}}
- {{client.email}} / {{client.phone}}
- {{event.title}} / {{event.date}} / {{event.time}}
- {{event.venue_name}} / {{event.venue_address}}
- {{quote.total}} / {{quote.number}}
- {{invoice.number}} / {{invoice.total}} / {{invoice.balance_due}}
- {{invoice.due_date}} / {{invoice.retainer_amount}}
- {{contract.link}} — Direct link to the contract signing page
- {{portal.link}} — Link to the client's full portal
- {{host.company_name}} / {{host.email}} / {{host.phone}}
- {{host.signature}} — Your signature block (set in Settings → Branding → Email Header)

**Example: Post-Event Review Request**
1. Create a template called "Post-Event Review Request"
   - Subject: "How was your experience, {{client.first_name}}?"
   - Body: "Hi {{client.first_name}}, thank you for booking {{host.company_name}} for {{event.title}}! We'd love a quick review: [link]"
2. Create an Automation Rule:
   - Trigger: 3 Days After Event
   - Delay: 0 hours (fires immediately at that point)
   - Template: "Post-Event Review Request"

Set it up once — it runs for every future booking automatically.

**Example: Balance Due Reminder**
- Trigger: 14 Days Before Event
- Template with {{invoice.balance_due}} and {{portal.link}}`,
  },

  // ─── COUPONS ────────────────────────────────────────────────────────────────
  {
    id: 'coupons-overview',
    category: 'Discounts & Coupons',
    categoryIcon: '🏷️',
    title: 'Creating & Applying Discount Coupons',
    slug: 'coupons',
    content: `Coupons let you offer promotional discounts that can be applied to any quote.

**Creating a Coupon**
Go to Settings → Coupons → New Coupon. Fill in:
- **Code** — Auto-uppercased. Example: SUMMER25, WEDDING10, REFERRAL50. Share this code with clients who qualify.
- **Description** — Internal note (e.g. "Summer 2026 promotion"). Shown in the coupon list but not to clients.
- **Type** — Percentage (% off subtotal) or Fixed Amount ($ off)
- **Value** — e.g. 20 for 20% off, or 100 for $100 off
- **Max Uses** — Leave blank for unlimited uses; enter a number to limit (e.g. 10 for the first 10 bookings)
- **Expiry Date** — Optional. The coupon won't be usable after this date.

**Applying a Coupon to a Quote**
When creating or editing a quote, click "Add discount or coupon" below the line items. Choose "🏷 Coupon Code" and select the code from the dropdown. The system validates the coupon (active, not expired, uses remaining) and shows the discount amount in real time.

You can also apply a manual one-time discount (% or $ amount) without creating a reusable coupon code.

**How It Appears to the Client**
The discount shows as a labeled line item in the quote:
SUMMER25 (20% off): −$284.00

**Managing Coupons**
- Toggle Active/Inactive with the toggle button — deactivated coupons cannot be applied to new quotes
- Delete coupons that have zero uses (used coupons are protected from deletion; deactivate instead)
- Usage count updates automatically each time a coupon is applied to a quote

**Ideas for Coupons**
- Referral discounts (REFER2026 — $50 off for referred clients)
- Seasonal promotions (WINTER20 — 20% off winter bookings)
- Repeat client discount (COMEBACK — 15% off for returning clients)
- Early booking bonus (EARLYBIRD — $75 off when booked 90+ days out)`,
  },

  // ─── FULL WORKFLOW ──────────────────────────────────────────────────────────
  {
    id: 'workflow-full',
    category: 'Workflows',
    categoryIcon: '🔄',
    title: 'Complete Workflow: From Lead to Review Request',
    slug: 'full-workflow',
    content: `This is the end-to-end flow for a typical booking — from a visitor filling out your inquiry form to receiving a 5-star review after the event.

---

**Step 1 — Inquiry Arrives**
A visitor on your website fills out your embedded inquiry form (installed from Settings → Lead Capture). A Lead is created in your dashboard, and you get an email notification with their event details.

**Step 2 — Review & Respond**
Open the lead in Booth Genius. Review their event date, type, venue, and guest count. Send a reply through the built-in message thread — your reply arrives in their email inbox. Update the lead status to CONTACTED.

**Step 3 — Convert to Event**
Click "Convert to Event." Booth Genius creates a new Event and Client record with the lead's info pre-filled. The lead status changes to CONVERTED.

**Step 4 — Build the Quote**
From the event page, click "New Quote." Add your packages and any additional line items. Apply a coupon if relevant. Set the deposit % (e.g. 50%) and confirm the balance due date. Attach your contract template. Click "Send Quote."

**Step 5 — Client Reviews the Quote**
The client receives an email with their portal link. They open boothgen.com/portal/[token] and see the Quote tab first. They read through the line items, total, and your terms. When ready, they type their full name and click "Accept Quote."

**Step 6 — Contract Signing**
Immediately after accepting, the client is taken to the Contract tab where the auto-generated contract awaits. They read it and type their name to sign digitally. You receive a notification that the contract was signed.

**Step 7 — Counter-Sign**
Log in to Booth Genius and go to the event's Contract tab (or the Contracts section). Open the contract and add your counter-signature to make it fully executed.

**Step 8 — Deposit Payment**
The client returns to their portal (or clicks the Invoice tab directly from the contract confirmation screen). They see the deposit amount due and pay by credit card via Stripe. The deposit lands in your Stripe account within 2 business days.

**Step 9 — Design Approval (Optional)**
If you design custom overlays or templates, upload a mockup to the event's Design tab. The client reviews it in their portal and clicks "Approve" or "Request Revision."

**Step 10 — Day of Event**
Run your event. Open the event detail page and work through the event's Checklist — check off tasks as you set up. Booth Genius keeps all client info, venue details, special notes, and your task list accessible from the mobile-friendly dashboard.

**Step 11 — Upload Gallery Photos (Pro)**
After the event, upload photos from the event's Gallery tab. Once you publish the gallery, the client gets an automated email notification. They can view and download photos from their portal. Share the Guest Gallery Link (not the portal link) with wedding guests or family members.

**Step 12 — Balance Collection**
If using Deposit + Balance payment, the client receives a balance reminder email (via your automation rule) before the balance due date. They pay the remaining amount from the Invoice tab. The gallery unlocks automatically once fully paid.

**Step 13 — Review Request (Automated)**
Three days after the event date (or your configured delay), an automated email fires: "We hope you loved your experience! Would you mind leaving us a quick review?" with a direct link to your Google Business, WeddingWire, or Facebook page. Set this up once in Automation and it runs for every booking forever.

---

**Total time savings vs. manual tools: approximately 45–90 minutes per booking.**`,
  },

  // ─── CALENDAR ───────────────────────────────────────────────────────────────
  {
    id: 'calendar-overview',
    category: 'Calendar',
    categoryIcon: '📅',
    title: 'Using the Event Calendar',
    slug: 'calendar',
    content: `The Calendar gives you a full monthly view of everything on your schedule — booked events, leads with requested dates, and in-progress jobs — at a glance.

**Accessing the Calendar**
Click Calendar in the left sidebar. The calendar opens to the current month.

**What Shows on the Calendar**
Each day cell shows any events or leads whose event date falls on that day:
- **Events** are color-coded by status — blue (Lead), yellow (Quoted), orange (Booked), brand color (In Progress), green (Completed). Cancelled events appear gray with a strikethrough.
- **Lead Inquiries** appear in purple with a ✦ prefix, so you can distinguish unconfirmed inquiries from booked events at a glance.
- **Unavailable dates** (blocked by you) appear with a red "Unavailable" chip.

If a day has more than 3 items, a "+N more" indicator shows. Click through to the event or lead to see full details.

**Navigating Months**
Use the left and right arrows to move between months. Click the "Today" button at any time to jump back to the current month. Today's date is highlighted with an orange circle.

**Creating an Event from the Calendar**
Click any date number to open the New Event form pre-filled with that date. This is the fastest way to block a date once a client verbally confirms — you can fill in the rest of the details later.

**Status Legend**
A color legend at the bottom of the calendar shows what each color means. Lead inquiries (purple) and unavailable dates (red) are listed separately.

**Tips**
- Use the calendar to quickly spot double-bookings before sending a quote
- Check the calendar on the morning of an event to see exactly what's happening that day
- Leads in purple are a useful reminder of dates that are "soft holds" — follow up before confirming`,
  },
  {
    id: 'calendar-blackout',
    category: 'Calendar',
    categoryIcon: '📅',
    title: 'Blocking Unavailable Dates',
    slug: 'blackout-dates',
    content: `Block dates when you're unavailable so clients can't accidentally request a date you can't cover. Blocked dates are enforced on your embedded lead capture form in real time.

**How to Block a Date**
1. Go to Calendar in the sidebar
2. Click the "Block Dates" button in the top-right area — the button turns red and a banner appears explaining you're in block mode
3. Click any date on the calendar to mark it as unavailable — the date turns red immediately
4. Click the same date again to unblock it
5. Click "Done Blocking" to exit block mode

**What Clients See**
- On your embedded lead inquiry form, when a client picks a blocked date in the Event Date field, an inline warning appears: "Sorry, we're not available on this date. Please choose another date." The submit button is also disabled until they select a different date.
- If a client somehow bypasses the form check, the server also rejects submissions for blocked dates — the form returns the same error message.
- On the calendar itself (visible to you and your team), blocked dates show a red "Unavailable" chip in the day cell.

**When to Use Blackout Dates**
- Holidays or personal time off
- Dates you're already committed to outside of Booth Genius (another job booked on another platform)
- "Buffer" days — if you need a day of rest after a large event
- Seasonal closures

**Unblocking a Date**
Re-enter block mode (click "Block Dates") and click the red date again. It returns to normal immediately. If a lead was already submitted for that date before you blocked it, the existing lead is unaffected — the block only prevents new submissions going forward.`,
  },
  {
    id: 'calendar-ical',
    category: 'Calendar',
    categoryIcon: '📅',
    title: 'Subscribing to Your Calendar in Google / Apple',
    slug: 'ical-subscription',
    content: `Your Booth Genius events can appear directly in Google Calendar, Apple Calendar, or any calendar app that supports iCal subscriptions — so you always have your schedule in one place without manually copying dates.

**Getting Your Subscription URL**
1. Go to Calendar in the sidebar
2. Scroll to the bottom of the page — you'll see a "Subscribe to Your Calendar" panel
3. Click the Copy button to copy your personal subscription URL

This URL is private to your account. Anyone with this URL can read your event schedule, so treat it like a password.

**Adding to Google Calendar**
1. Open Google Calendar (calendar.google.com)
2. Click the + icon next to "Other calendars" in the left sidebar
3. Select "From URL"
4. Paste your subscription URL and click "Add calendar"
5. Your Booth Genius events appear as a new calendar (you can rename and recolor it)

Google Calendar typically syncs every 12–24 hours — new events may not appear instantly.

**Adding to Apple Calendar**
1. Open Calendar on your Mac or iPhone
2. On Mac: File → New Calendar Subscription; on iPhone: tap Calendars → Add Calendar → Add Subscription Calendar
3. Paste the subscription URL
4. Tap/click Subscribe and adjust sync frequency if desired

**What Appears in Your External Calendar**
- All non-cancelled events with their title, date, venue name, and venue address
- Confirmed bookings (BOOKED / IN_PROGRESS) appear as CONFIRMED events
- Other statuses (LEAD, QUOTED, COMPLETED) appear as TENTATIVE
- Cancelled events are excluded entirely

**Regenerating Your URL**
If you believe your subscription URL has been shared with someone who shouldn't have it, click "Regenerate link" at the bottom of the subscription panel. This creates a new URL and immediately invalidates the old one. You'll need to re-add the subscription in your calendar app using the new URL.`,
  },

  // ─── DASHBOARD ──────────────────────────────────────────────────────────────
  {
    id: 'dashboard-overview',
    category: 'Dashboard',
    categoryIcon: '🏠',
    title: 'Reading Your Dashboard',
    slug: 'dashboard',
    content: `The Dashboard is your home base — a real-time summary of what's happening across all your events and clients.

**Stats Row**
The top row shows four key numbers updated in real time:
- **Total Events** — All events across all statuses
- **Active Bookings** — Events currently in BOOKED or IN_PROGRESS status
- **This Month Revenue** — Payments received in the current calendar month
- **Leads This Month** — New inquiries submitted this month

**Requires Attention**
This section highlights items that need your action before they hold up a client. It currently tracks:
- Events where the client has requested a design revision — a revision request means the client reviewed your template design and asked for changes; the alert clears automatically once you upload a new version and the client approves it
- Only events where the **latest** design version is still pending revision appear here — if you've already uploaded a corrected version, the alert goes away even if an older version was rejected

**Recent Activity**
Below "Requires Attention" is a Recent Activity feed showing design approvals from the last 30 days. Each row shows the client name, approved version, event title, and how long ago the approval happened. This gives you a quick record of what's been signed off without digging into individual events.

**Upcoming Events**
A list of your next several events sorted by date, with their status badges. Click any event to go directly to its detail page.

**Recent Leads**
Your most recently submitted lead inquiries, with the event date and lead status. Click a lead to open it and respond.`,
  },

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  {
    id: 'settings-packages',
    category: 'Settings',
    categoryIcon: '⚙️',
    title: 'Managing Service Packages',
    slug: 'packages',
    content: `Service packages are pre-defined services with prices that appear as quick-add buttons when building quotes.

**Creating a Package**
Go to Settings → Packages → New Package. Fill in:
- **Name** — e.g. "3-Hour Booth Rental"
- **Description** — Optional. If provided, it's appended to the line item description in quotes (e.g. "3-Hour Booth Rental — Includes attendant, props, and digital copies")
- **Price** — The base price in dollars

**Using Packages in Quotes**
When creating or editing a quote, packages appear as clickable buttons at the top of the line items section. Clicking a package adds it as a line item. You can then adjust the quantity or price for that specific quote.

**Editing & Deleting**
Packages can be edited at any time. Changes to a package only affect new quotes — existing quotes are not retroactively updated.`,
  },
  {
    id: 'settings-billing',
    category: 'Settings',
    categoryIcon: '⚙️',
    title: 'Billing & Plan Management',
    slug: 'billing',
    content: `Manage your Booth Genius subscription and Stripe Connect account from Settings → Billing.

**Commission Plan (Free)**
- No monthly fee
- A platform commission % is deducted from each payment collected through Stripe
- Includes all features EXCEPT photo gallery
- Best for operators starting out or running fewer than ~4–5 events per month

**Pro Plan**
- Flat monthly or annual subscription fee
- Zero commission on any booking — you keep 100% of what Stripe sends you
- Includes Photo Gallery (Pro) feature
- Annual billing saves ~15–20% compared to monthly
- Best for operators with consistent booking volume

**Switching Plans**
Go to Settings → Billing to upgrade to Pro or manage your subscription. You can cancel at any time — you'll retain Pro access until the end of your billing period.

**Stripe Connect — Two separate Stripe relationships**
Booth Genius uses Stripe in two distinct ways that are easy to confuse:

1. **Booth Genius subscription billing** — If you're on the Pro plan, Stripe charges your card the monthly fee. This is Booth Genius paying *you* nothing — it's you paying Booth Genius.
2. **Stripe Connect (client payments)** — This is a separate connection that routes your *clients'* invoice payments directly to your bank account. Booth Genius never holds your funds.

Both Free and Pro plan operators need to set up Stripe Connect to accept online payments. Go to Settings → Billing → Connect Stripe. If you already have a Stripe account, just log in during the flow — Stripe will link your existing account. No new account required. Takes about 60 seconds.

Once connected, your Stripe account status shows as "Connected" and clients can pay invoices online. If you disconnect Stripe, clients will no longer be able to pay online until you reconnect.

**Commission Rate**
The current commission rate is displayed in Settings → Billing and on the marketing page. This rate is set by the Booth Genius platform and may change over time.`,
  },

  {
    id: 'settings-profile',
    category: 'Settings',
    categoryIcon: '⚙️',
    title: 'Managing Your Profile',
    slug: 'profile',
    content: `Your profile controls your personal account details — separate from your business branding.

**Accessing Profile Settings**
Go to Settings → Profile (the last tab in the Settings navigation).

**Display Name**
Your display name appears in the sidebar navigation and on your account. Update it here and click "Save Changes" — the change takes effect immediately across the dashboard.

**Email Address**
Your login email is shown but cannot be changed from this screen. If you need to change your login email, contact support@boothgen.com.

**Note for Team Members**
Each team member has their own profile. Team members log in with their own email and password and can update their own display name from their Settings → Profile page.`,
  },
  {
    id: 'settings-checklists',
    category: 'Settings',
    categoryIcon: '⚙️',
    title: 'Checklist Templates',
    slug: 'checklist-templates',
    content: `Checklist templates are reusable task lists you build once in Settings and apply to any event with a single click — great for day-of setup routines, equipment packing lists, or post-event wrap-up steps.

**Accessing Checklist Templates**
Go to Settings → Checklists (the tab in the Settings navigation).

**Creating a Template**
1. Click "New Template"
2. Enter a template name (e.g. "Day-Of Setup" or "Equipment Pack List")
3. In the Items field, paste your task list — one item per line. Example:
   - Pack photo booth equipment
   - Charge all batteries overnight
   - Print test photo strips
   - Confirm venue address and parking
4. Click "Create Template"

**Editing a Template**
Click on any template card to expand it. From the expanded view you can:
- Add individual items using the "Add item" link at the bottom — type and press Enter or click Add
- Delete any item by hovering over it and clicking the trash icon
- Delete the entire template with the trash icon in the template header (this cannot be undone)

**Applying a Template to an Event**
Templates are applied from the event detail page, not from Settings. See "Event Checklists" for how to use them during actual events.

**Tips**
- Create different templates for different event types (weddings vs. corporate vs. birthday parties) if your setup process varies
- Even a simple 5-item packing list eliminates the mental overhead of remembering everything on event day
- Templates can be applied multiple times to the same event — useful if you want to stack a general setup list and an event-specific list`,
  },

  // ─── CHECKLISTS ─────────────────────────────────────────────────────────────
  {
    id: 'checklists-event',
    category: 'Event Checklists',
    categoryIcon: '✅',
    title: 'Using Event Checklists',
    slug: 'event-checklists',
    content: `Every event in Booth Genius has a built-in checklist — a personal task list for that specific booking. Use it to track setup steps, equipment, or anything else that needs to happen before, during, or after the event.

**Finding the Checklist**
Open any event detail page and scroll to the bottom. You'll see a "Checklist" card. The card shows a progress bar (X/Y done) once you have items.

**Adding a Task**
Type a task in the "Add a task…" input at the bottom of the checklist and press Enter (or click the + button). The item appears immediately.

**Applying a Reusable Template**
If you've set up checklist templates in Settings → Checklists, a dropdown button appears in the checklist card header. Click "Apply Template" to choose a template — all of its items are added to the event's checklist below any existing items. You can apply multiple templates to the same event.

**Checking Off Tasks**
Click the checkbox icon on the left of any item to mark it complete. The item text gets a strikethrough and the progress bar updates. Click again to uncheck.

**Removing a Task**
Hover over any checklist item — a trash icon appears on the right. Click it to remove the item. This is immediate and permanent.

**Who Can See the Checklist**
The checklist is visible to all team members who have access to the event — both operators and assigned team members. Everyone can add, check, and delete items. It's a shared task list for the whole team working that event.

**Progress Bar**
The colored bar at the top of the checklist fills from left to right as items are checked off. It turns fully green at 100%. A quick visual indicator when you're reviewing the event on event day.

**Example Checklist for a Wedding Booth**
- ✅ Confirm venue address and parking
- ✅ Pack photo booth main unit
- ✅ Pack backdrop and stands
- ✅ Charge ring light battery
- ✅ Load prop basket
- ✅ Test print with venue Wi-Fi
- ✅ Set up by 4:00 PM
- ✅ Break down after cocktail hour ends`,
  },

  // ─── FAQS ───────────────────────────────────────────────────────────────────
  {
    id: 'faq-general',
    category: 'FAQ',
    categoryIcon: '❓',
    title: 'Frequently Asked Questions',
    slug: 'faq',
    content: `**Q: Do my clients need to create an account?**
A: No. Clients access everything through a unique portal link — no account, no password, no app download required.

**Q: Can I use Booth Genius without connecting Stripe?**
A: Yes. You can create quotes, contracts, and invoices and track everything without Stripe. However, clients won't be able to pay online until Stripe is connected. You can record manual payments (cash, check, Venmo) from within the platform.

**Q: Is there a limit to how many events or clients I can have?**
A: No. Both plans include unlimited events and clients.

**Q: What happens to my data if I cancel?**
A: Your data remains accessible for 30 days after cancellation. After that, it's permanently removed from our systems. We recommend exporting any important records before cancelling.

**Q: Can clients see the commission % being deducted?**
A: No. Clients see only the invoice total and payment amounts. The commission is a backend deduction handled between Booth Genius and your Stripe account — transparent to you, invisible to clients.

**Q: How do I handle a client who wants to pay in installments?**
A: Use the Deposit + Balance milestone system for two-payment arrangements. For more complex payment plans, create custom milestone entries manually from the invoice detail page.

**Q: Can I send a quote without an event?**
A: Quotes must be linked to an event. If you receive an inquiry and want to send a quick proposal, first convert the lead to an event (or create a placeholder event), then create the quote from there.

**Q: What if I need to change the price after the client has already paid a deposit?**
A: Click "Revise Quote" to reset the quote to Draft. This will invalidate the previous acceptance. Note: changing the total after a deposit is paid requires careful coordination — communicate the change with the client and issue a manual credit or adjustment in Stripe if necessary.

**Q: Can multiple team members work at the same time?**
A: Yes. Multiple users can be logged in and working simultaneously. There's no locking system — just be careful not to edit the same record at the same time.

**Q: Does Booth Genius work on mobile?**
A: Yes. The operator dashboard is mobile-friendly. The client portal is fully mobile-optimized. Everything works on iOS and Android browsers.

**Q: How do I get a refund to a client through Stripe?**
A: Log in to your Stripe dashboard at dashboard.stripe.com, find the payment, and issue a full or partial refund from there. Booth Genius does not currently support in-app refunds.

**Q: Can I customize which fields are on the inquiry form?**
A: Yes. Go to Settings → Lead Capture (Embed tab). Toggle which fields appear (venue, guest count, hours needed, etc.) and which are required vs. optional.

**Q: What browsers are supported?**
A: Chrome, Safari, Firefox, and Edge — all current versions. Internet Explorer is not supported.

**Q: How do I contact support?**
A: Email us at support@boothgen.com. You can also use the AI chat assistant on this page for instant answers to common questions.`,
  },
];

const CATEGORIES = [
  { label: 'Getting Started', icon: '🚀', color: 'bg-blue-50 border-blue-200 text-blue-700', desc: 'Account setup, branding, first steps' },
  { label: 'Leads', icon: '📥', color: 'bg-green-50 border-green-200 text-green-700', desc: 'Lead capture, responding, converting' },
  { label: 'Quotes & Proposals', icon: '📄', color: 'bg-orange-50 border-orange-200 text-orange-700', desc: 'Building and sending quotes' },
  { label: 'Contracts & Signatures', icon: '✍️', color: 'bg-purple-50 border-purple-200 text-purple-700', desc: 'Templates, e-signatures, countersigning' },
  { label: 'Invoicing & Payments', icon: '💳', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', desc: 'Deposits, Stripe, milestones' },
  { label: 'Client Portal', icon: '🖼️', color: 'bg-indigo-50 border-indigo-200 text-indigo-700', desc: 'What clients see and do' },
  { label: 'Photo Gallery (Pro)', icon: '📸', color: 'bg-pink-50 border-pink-200 text-pink-700', desc: 'Upload, share, expiry, guest links' },
  { label: 'Team Management', icon: '👥', color: 'bg-teal-50 border-teal-200 text-teal-700', desc: 'Invites, roles, access control' },
  { label: 'Automation & Emails', icon: '⚡', color: 'bg-amber-50 border-amber-200 text-amber-700', desc: 'Triggers, templates, merge tags' },
  { label: 'Discounts & Coupons', icon: '🏷️', color: 'bg-lime-50 border-lime-200 text-lime-700', desc: 'Promo codes, % and $ off' },
  { label: 'Calendar', icon: '📅', color: 'bg-sky-50 border-sky-200 text-sky-700', desc: 'Monthly view, availability, iCal sync' },
  { label: 'Event Checklists', icon: '✅', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', desc: 'Day-of task lists, templates, progress' },
  { label: 'Dashboard', icon: '🏠', color: 'bg-violet-50 border-violet-200 text-violet-700', desc: 'Stats, attention alerts, activity' },
  { label: 'Workflows', icon: '🔄', color: 'bg-cyan-50 border-cyan-200 text-cyan-700', desc: 'End-to-end booking walkthroughs' },
  { label: 'Settings', icon: '⚙️', color: 'bg-gray-50 border-gray-200 text-gray-700', desc: 'Packages, billing, checklists, profile' },
  { label: 'FAQ', icon: '❓', color: 'bg-rose-50 border-rose-200 text-rose-700', desc: 'Quick answers to common questions' },
];

function resolveArticles(settings: Record<string, string>) {
  const replace = (text: string) =>
    text
      .replace(/\[\[gallery_expire_days\]\]/g, settings.gallery_expire_days ?? '2')
      .replace(/\[\[gallery_delete_days\]\]/g, settings.gallery_delete_days ?? '5')
      .replace(/\[\[message_retention_months\]\]/g, settings.message_retention_months ?? '12');
  return ARTICLES.map(a => ({ ...a, content: replace(a.content) }));
}

export default async function SupportPage() {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['chatbot_enabled', 'gallery_expire_days', 'gallery_delete_days', 'message_retention_months'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const chatbotEnabled = map.chatbot_enabled !== 'false';
  const articles = resolveArticles(map);

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-900 transition-colors hidden sm:block">← Back to Home</Link>
            <Link href="/sign-in" className="px-4 py-1.5 bg-orange-500 text-white font-semibold rounded-lg text-sm hover:bg-orange-600 transition-colors">Sign In</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247] py-16 px-4 sm:px-6 text-center">
        <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-3">Support Center</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">How can we help?</h1>
        <p className="text-purple-200 text-base mb-8 max-w-xl mx-auto">Search our guides or ask the AI assistant. Everything you need to run your photo booth business like a Genius.</p>
        <SupportSearch articles={articles} />
      </section>

      {/* Category Cards */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Browse by topic</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {CATEGORIES.map(cat => (
            <a key={cat.label} href={`#${cat.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              className={`flex flex-col gap-1 p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md ${cat.color}`}>
              <span className="text-2xl">{cat.icon}</span>
              <p className="font-bold text-sm">{cat.label}</p>
              <p className="text-xs opacity-70 leading-snug">{cat.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Articles by category */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 space-y-16">
        {CATEGORIES.map(cat => {
          const catArticles = articles.filter(a => a.category === cat.label);
          if (!catArticles.length) return null;
          return (
            <div key={cat.label} id={cat.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">{cat.icon}</span>
                <h2 className="text-xl font-extrabold text-gray-900">{cat.label}</h2>
              </div>
              <div className="space-y-4">
                {catArticles.map(article => (
                  <details key={article.id} id={article.slug} className="group border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 transition-colors">
                    <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors">
                      <h3 className="font-semibold text-gray-900 text-base group-open:text-orange-600 transition-colors">{article.title}</h3>
                      <span className="text-gray-400 text-xl ml-4 flex-shrink-0 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="px-6 pb-6 pt-2 prose prose-sm prose-gray max-w-none
                      prose-headings:font-bold prose-headings:text-gray-900
                      prose-p:text-gray-600 prose-p:leading-relaxed
                      prose-strong:text-gray-900 prose-strong:font-semibold
                      prose-ul:text-gray-600 prose-li:marker:text-orange-400
                      prose-hr:border-gray-100">
                      {article.content.split('\n\n').map((para, i) => {
                        if (para.startsWith('---')) return <hr key={i} />;
                        if (para.startsWith('**Step ') || para.startsWith('**Q:')) {
                          const parts = para.split('\n');
                          return (
                            <div key={i} className="mb-4">
                              {parts.map((line, j) => {
                                const bold = line.match(/^\*\*(.+?)\*\*(.*)$/);
                                if (bold) return <p key={j} className="text-gray-700"><strong className="text-gray-900">{bold[1]}</strong>{bold[2]}</p>;
                                if (line.startsWith('- ')) return <p key={j} className="text-gray-600 ml-4">• {line.slice(2)}</p>;
                                return line ? <p key={j} className="text-gray-600">{line}</p> : null;
                              })}
                            </div>
                          );
                        }
                        const lines = para.split('\n');
                        return (
                          <div key={i} className="mb-4">
                            {lines.map((line, j) => {
                              if (!line.trim()) return null;
                              const bold = line.match(/^\*\*(.+?)\*\*(.*)$/);
                              if (bold) return <p key={j} className="font-semibold text-gray-900 mt-3 mb-1">{bold[1]}<span className="font-normal text-gray-600">{bold[2]}</span></p>;
                              if (line.startsWith('- ')) return <p key={j} className="text-gray-600 ml-4 my-0.5">• {line.slice(2)}</p>;
                              return <p key={j} className="text-gray-600">{line}</p>;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4 text-center">
        <p className="text-sm text-gray-400">Still need help? Email us at <a href="mailto:support@boothgen.com" className="text-orange-500 hover:underline">support@boothgen.com</a></p>
        <p className="text-xs text-gray-300 mt-2">© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
      </footer>

      {/* AI Chat Widget */}
      {chatbotEnabled && <SupportChat />}
    </div>
  );
}
