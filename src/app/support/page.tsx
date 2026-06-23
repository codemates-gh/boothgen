import type { Metadata } from 'next';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { SupportSearch } from './SupportSearch';
import { SupportChat } from './SupportChat';

export const metadata: Metadata = {
  title: 'Support Center — Booth Genius',
  description: 'Help guides, feature documentation, and step-by-step workflows for Booth Genius — the photo booth business platform.',
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
Go to Settings → Billing → Connect Stripe. You'll be redirected to Stripe to set up a free Stripe Connect account (or link your existing one). This is required before clients can pay invoices online. Booth Genius never holds your money — all payments go directly to your Stripe account.

**Step 4 — Add Your Service Packages**
Go to Settings → Packages. Create packages for your common booth rental options (e.g. "3-Hour Booth — $800", "4-Hour Booth — $1,000"). These populate as quick-add buttons when building quotes, so you don't have to re-type services for every booking.

**Step 5 — Create a Contract Template**
Go to Settings → Contracts → Templates. Create at least one contract template using merge tags like {{client_name}}, {{event_date}}, {{total_amount}}, {{venue_name}}. This template auto-populates when a client accepts a quote and signs digitally.

**Step 6 — Set Up Lead Capture**
Go to Settings → Lead Capture (Embed tab). Copy the JavaScript snippet and paste it into your website's HTML — typically in the footer or on a Contact/Book Now page. When a visitor submits the form, a lead will appear automatically in your Booth Genius dashboard.

**Step 7 — Configure Email Automation (Optional)**
Go to Automation in the sidebar. Set up trigger-based emails: for example, a thank-you email when a quote is accepted, or a reminder when a balance payment is due. Go to Email Templates to customize the wording.

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
Open a lead to see the inquiry details — event date, event type, venue, guest count, hours needed, and any additional message. Use the message thread to send replies. Your reply goes to the client's email, and their response comes back into the thread.

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
Galleries expire after a platform-configured number of days from the event date. Clients are reminded via email before expiration. After the expiry period, photos enter a deletion buffer before permanent removal. You and the client will both receive a warning email 2 days before permanent deletion.

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
Go to Automation in the sidebar. Create a rule by selecting:
1. **Trigger** — The event that fires the automation
2. **Delay** — Send immediately, or wait a specified number of hours/days
3. **Email Template** — The email content to send (create templates in Automation → Email Templates)

**Available Triggers**
- Lead Created — Fire when a new inquiry comes in
- Quote Sent — Fire when you send a quote
- Quote Accepted — Fire when the client accepts
- Contract Signed — Fire when the contract is fully signed
- Invoice Sent — Fire when an invoice goes out
- Deposit Paid — Fire when the client pays the deposit
- Balance Paid — Fire when the invoice is fully paid
- Event Date Approaching — Fire X days before the event date
- Event Date Passed — Fire X days after the event date (great for review requests and gallery follow-up)

**Email Templates**
Go to Automation → Email Templates (or the Email Templates item in the sidebar). Create templates using merge tags:
- {{client_first_name}} — Client's first name
- {{event_date}} — Date of the event
- {{event_title}} — Event name
- {{portal_url}} — Link to the client's portal
- {{balance_amount}} — Outstanding balance
- {{operator_name}} — Your business name
- {{gallery_url}} — Link to the client's photo gallery

**Example: Review Request Automation**
1. Create an Email Template called "Post-Event Review Request"
   - Subject: "How was your experience with {{operator_name}}?"
   - Body: "Hi {{client_first_name}}, thank you so much for booking with us for {{event_title}}! We hope you and your guests had an amazing time. If you have a moment, we'd love a review: [Your Google/WeddingWire/Facebook link]"
2. Create an Automation Rule:
   - Trigger: Event Date Passed
   - Delay: 3 days
   - Template: "Post-Event Review Request"
Now every client automatically receives a review request 3 days after their event — without you lifting a finger.

**Example: Balance Reminder**
- Trigger: Event Date Approaching
- Delay: 14 days before
- Template: "Balance Due Reminder" with {{balance_amount}} and {{portal_url}}

**Disabling an Automation**
Toggle the automation rule off from the Automation list. It can be re-enabled at any time.`,
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
Run your event. Booth Genius keeps all client info, venue details, and special notes accessible from the mobile-friendly dashboard.

**Step 11 — Upload Gallery Photos (Pro)**
After the event, upload photos from the event's Gallery tab. Once you publish the gallery, the client gets an automated email notification. They can view and download photos from their portal. Share the Guest Gallery Link (not the portal link) with wedding guests or family members.

**Step 12 — Balance Collection**
If using Deposit + Balance payment, the client receives a balance reminder email (via your automation rule) before the balance due date. They pay the remaining amount from the Invoice tab. The gallery unlocks automatically once fully paid.

**Step 13 — Review Request (Automated)**
Three days after the event date (or your configured delay), an automated email fires: "We hope you loved your experience! Would you mind leaving us a quick review?" with a direct link to your Google Business, WeddingWire, or Facebook page. Set this up once in Automation and it runs for every booking forever.

---

**Total time savings vs. manual tools: approximately 45–90 minutes per booking.**`,
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

**Stripe Connect**
Click "Connect Stripe" in Settings → Billing. You'll complete a Stripe onboarding flow. Once connected, your Stripe account status shows as "Connected" and clients can pay invoices online. If you disconnect Stripe, clients will no longer be able to pay online until you reconnect.

**Commission Rate**
The current commission rate is displayed in Settings → Billing and on the marketing page. This rate is set by the Booth Genius platform and may change over time.`,
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
  { label: 'Automation & Emails', icon: '⚡', color: 'bg-amber-50 border-amber-200 text-amber-700', desc: 'Triggers, templates, sequences' },
  { label: 'Discounts & Coupons', icon: '🏷️', color: 'bg-lime-50 border-lime-200 text-lime-700', desc: 'Promo codes, % and $ off' },
  { label: 'Workflows', icon: '🔄', color: 'bg-cyan-50 border-cyan-200 text-cyan-700', desc: 'End-to-end booking walkthroughs' },
  { label: 'Settings', icon: '⚙️', color: 'bg-gray-50 border-gray-200 text-gray-700', desc: 'Packages, billing, configuration' },
  { label: 'FAQ', icon: '❓', color: 'bg-rose-50 border-rose-200 text-rose-700', desc: 'Quick answers to common questions' },
];

export default function SupportPage() {
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
        <SupportSearch articles={ARTICLES} />
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
          const catArticles = ARTICLES.filter(a => a.category === cat.label);
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
      <SupportChat />
    </div>
  );
}
