# Changelog

All notable changes to BoothGen (Booth Genius) are documented here.

---

## [2.0.7] — 2026-06-27

### Fixed
- **Client portal — "Deposit received" shown when payment is overdue/due today** — the PARTIALLY_PAID banner now shows three distinct states: green "Deposit received" (payment future), orange "Payment due today" (due date is today), and red "Payment overdue — action required" (past due)
- **Payment reminder email — "overdue" language used even when due today** — email subject, body, and callout now use "due today" (amber styling) vs "overdue" (red styling) based on whether the milestone date is today or in the past; applies to both the nightly cron and the manual Send Reminder button

---

## [2.0.6] — 2026-06-27

### Fixed
- **Send Reminder — no feedback after clicking** — button now shows a green confirmation banner ("Reminder sent to [name] ([email])") after the email is dispatched; implemented via redirect query param so no client-side JS or toast library required

---

## [2.0.5] — 2026-06-27

### Fixed
- **Invoice payment reminder — send on due date, not day after** — the nightly overdue-payment cron used `dueDate < today` (midnight), which excluded milestones due today and delayed the reminder email by one day; changed to `dueDate <= today` so the email fires on the actual due date
- **Dashboard overdue payment alerts not showing** — the "Requires Attention" panel queried `invoice.dueDate` (nullable — not set on milestone-based invoices), so invoices with payment milestones never surfaced as overdue; switched both overdue and due-soon queries to `PaymentMilestone.dueDate`, then deduplicate to one entry per invoice
- **Send Reminder button on invoice detail page** — added a "Send Reminder" button (visible on SENT, PARTIALLY_PAID, and OVERDUE invoices with a remaining balance) that immediately fires the overdue payment email to the client; uses the earliest unpaid milestone due date, falling back to the invoice-level due date

---

## [2.0.4] — 2026-06-26

### Fixed
- **Google OAuth — always show account picker** — clicking "Sign in with Google" previously skipped the account chooser in Safari (and any browser with an active Google session), silently logging back in as the last-used account; added `prompt: select_account` to the Google provider config so the account picker is always displayed

---

## [2.0.3] — 2026-06-26

### Fixed
- **Lead message retention — event date anchoring** — the nightly purge job previously deleted messages based on `sentAt` (message date), which could wipe threads for events booked a year in advance; now uses the **event date** as the anchor for converted leads (messages purged X months after the event); unconverted leads (never converted to an event) still use the message date as a fallback; events that haven't occurred yet are never purged early
- **Super admin + support page notices updated** to reflect the new retention logic

---

## [2.0.2] — 2026-06-26

### Added
- **Gallery publish email — password callout** — when a gallery has password protection set, the "Your photos are ready" client notification email now includes a green callout block showing the access code; the block is omitted entirely when no password is set
- **`{{gallery.password}}` merge tag** — available in the email template editor (Insert Variable → Gallery Password); resolves to the gallery's access code on `GALLERY_PUBLISHED` automation emails; empty string when no password is set so it renders nothing in the template

---

## [2.0.1] — 2026-06-26

### Changed
- **Super admin — Legal Pages: URL inputs → full-text editors** — replaced the Terms and Privacy URL input fields with large resizable textareas; paste the complete document verbiage directly into super admin and it is stored in the database
- **`/terms` and `/privacy` public pages** — new server-rendered pages at these routes display the stored content; return 404 when the respective field is empty; include a minimal branded header and footer
- **Footer and sign-up links now point to internal routes** — `/terms` and `/privacy` instead of external URLs; links still hidden when content is blank

---

## [2.0.0] — 2026-06-26

### Added
- **Super admin — Legal Pages settings** — new card in Platform Settings with URL inputs for Terms of Service and Privacy Policy; saved alongside all other platform settings via the existing PATCH endpoint
- **Marketing footer — Terms & Privacy links** — Terms and Privacy links appear in the footer nav when their URLs are populated in super admin; hidden when blank so the footer is unaffected until pages are ready
- **Sign-up — legal acknowledgement checkbox** — required "I agree to the Terms of Service and Privacy Policy" checkbox added to the sign-up form; each label links to its respective URL; the Create Account button is disabled until the box is checked; checkbox is hidden entirely when both URLs are empty so the sign-up flow is unchanged until URLs are configured

---

## [1.9.9] — 2026-06-25

### Fixed
- **Stripe commission — Pro subscribers no longer charged a fee** — payment intent creation was applying `application_fee_amount` to all operators regardless of subscription plan; now checks `stripeSubscription` on the tenant and sets fee to 0 for MONTHLY/ANNUAL subscribers with ACTIVE or PAST_DUE status
- **Stripe commission — rate now read exclusively from DB** — `STRIPE_PLATFORM_FEE_PERCENT` env var removed; commission percentage is always fetched from the `commission_percentage` system setting at payment time; removed the `applicationFee()` helper from `src/lib/stripe.ts` entirely
- **Template designs — "No designs uploaded yet" on event detail** — Vercel's build cache was skipping `postinstall`, so the Prisma client wasn't regenerated when the schema changed; fixed by adding `prisma generate &&` to the `build` script in `package.json`

### Added
- **Support page — dynamic settings in articles** — gallery expiry days, gallery deletion days, and message retention months in the Support Center now resolve from live super admin settings at render time instead of hardcoded values; placeholder tokens `[[gallery_expire_days]]`, `[[gallery_delete_days]]`, `[[message_retention_months]]` are replaced server-side on every page render
- **Stripe Connect — "already have Stripe?" callout** — blue info box added to the Stripe Connect setup card explaining that operators with an existing Stripe account don't need a new one; clarifies the two separate Stripe relationships (platform subscription vs. client payments)
- **Support page — Stripe two-account clarification** — Getting Started Step 3 and the Billing article updated to explain that the Booth Genius subscription and Stripe Connect are two separate Stripe relationships

---

## [1.9.8] — 2026-06-25

### Fixed
- **Email thread — `&nbsp;` showing as literal text** — HTML entity decoding added client-side (`decodeEntities()` helper in `LeadDetail.tsx`) and server-side (inbound webhook now decodes `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;` before stripping tags)
- **Email thread — line breaks lost in inbound messages** — server-side HTML stripping now converts `<br>`, `</p>`, and `</div>` tags to newlines before removing remaining HTML, preserving paragraph structure in the thread view
- **Email signature — merging into a single line** — `{{host.signature}}` was stored with `\n` line breaks but rendered as a single line; reply route now converts `\n` → `<br>` in the signature before injecting it into the outgoing HTML email

### Added
- **Attachment disclosure — compose notice** — amber info box added above the Compose tab on lead detail pages instructing operators that file attachments must be sent by CC'ing the client's email directly; prevents confusion when replies to the BoothGen thread can't carry attachments
- **Attachment disclosure — outbound email footer note** — sent emails now include a small grey footnote linking to the operator's contact email so clients know where to send files back; uses `replyToEmail` from the operator's branding settings
- **Default email template prefix** — all 6 pre-seeded email templates renamed with a `default_` prefix (e.g. `default_new_inquiry`, `default_quote_sent`) to distinguish them from operator-created templates; existing tenant records are migrated automatically on next deploy via `seed-email-defaults.ts`

---

## [1.9.7] — 2026-06-24

### Added
- **`/pricing` marketing page** — dedicated public pricing page with two-tier cards (Free + Pro), live breakeven calculator slider (adjustable avg booking $200–$2,000 and events/month 1–20), early adopter spot counter with FOMO indicator, Rate Lock Guarantee copy, and Stripe fee disclosure footer; data fetches directly from super admin settings with 60-second ISR revalidation
- **Early adopter cap in super admin** — new "Early Adopter Cap" card in Platform Settings shows live Pro subscriber count vs. cap, a progress bar, and an input to set the limit; when cap is reached, the pricing page CTA switches to "Join the Waitlist" automatically
- **"Powered by Booth Genius" on all client-facing pages** — badge added to the client payment portal footer, photo gallery footer, and embedded inquiry form; every client interaction becomes a passive brand impression
- **Dynamic pricing API** — `/api/public/pricing` now returns `commissionPct`, `proMonthlyPrice`, `earlyAdopterCap`, `proSubscriberCount`, `spotsRemaining`, and `subscriptionsOpen`; the Pro subscriber count is read live from the database

### Changed
- **Marketing nav Pricing link** — changed from `#pricing` (homepage anchor) to `/pricing` (dedicated page)
- **Super admin commission default** — updated from `5%` to `1.5%` to reflect the agreed introductory rate
- **`price_display_monthly` field** — now expects a numeric value (e.g. `25`) rather than display text (e.g. `$49/mo`); the pricing page formats it automatically

---

## [1.9.6] — 2026-06-24

### Added
- **Rich email composer on lead detail** — the Compose tab now uses the full `EmailTemplateEditor` instead of a plain textarea; supports bold/italic/underline, lists, links, image inserts, variable merge tags (client/event/company fields only), HTML mode, and live preview; loading a saved email template populates the rich editor so formatting and layout are preserved
- **CTA Button insert in email editor** — new "+ Button" toolbar item in `EmailTemplateEditor` opens an inline panel to enter a label and URL, then inserts a styled orange CTA button (matching brand color) directly into the email body; available in all email template contexts (lead compose, email template editor, contract template editor)
- **Info Card insert in email editor** — new "+ Card" toolbar item inserts a styled grey card block with a placeholder heading and two label/value rows; edit the content in HTML mode or directly in the visual editor; useful for pricing tables, event summary boxes, and package highlights

### Changed
- **Lead reply API** — now accepts `bodyHtml` (rich HTML from the editor) in addition to the existing plain `body` field; plain-text fallback preserved for backward compatibility; `bodyText` stored in the thread is the stripped plain-text version of the HTML

---

## [1.9.5] — 2026-06-24

### Fixed
- **Duplicate inquiry confirmation email** — clients were receiving two "Thank you for your inquiry" emails: one at form submission (correct) and one ~6 minutes later when the operator clicked "Convert to Event". The convert route was firing `inngest.send('lead/created')` which re-triggered the LEAD_CREATED automation with the newly created Event record. Removed the redundant Inngest send from the convert route — the confirmation email belongs to the submission step only

---

## [1.9.4] — 2026-06-24

### Fixed
- **Convert to Event — no longer requires Edit + Save** — clicking "Convert to Event" on a lead now navigates directly to the event detail page; the event was already created by the API, so the extra Edit → Save step was redundant and confusing
- **Client portal — partial payment stuck in "payment window"** — after paying a deposit via Stripe and being redirected back, the portal now shows a "Deposit received — you're all set for now!" confirmation card with the next payment due date; the Stripe polling logic was also corrected to always poll for ~8 seconds after a payment redirect rather than stopping early when a prior balance was on record
- **Stripe webhook — test mode signing secret mismatch** — the webhook at `boothgen.vercel.app` was failing in Stripe sandbox/test mode because the `STRIPE_WEBHOOK_SECRET` env var held the live mode secret; fix: add the test mode webhook signing secret as a separate env var (see notes below)

---

## [1.9.3] — 2026-06-24

### Added
- **Google Calendar / iCal subscription** — operators can now subscribe to their BoothGen events in any calendar app (Google Calendar, Apple Calendar, Outlook); Calendar page shows a subscription URL with one-click copy and step-by-step instructions for Google and Apple; URL is based on a private token that can be regenerated to invalidate old links; confirmed/booked events show as CONFIRMED, others as TENTATIVE; cancelled events excluded
- **Availability / Blackout Dates** — new "Block Dates" toggle on the Calendar page; clicking a date in block mode marks it unavailable (red); clicking again unblocks; blocked dates show an "Unavailable" chip in normal view; lead form checks availability on date input change and shows inline error + disables submit for blocked dates; server-side check also rejects blocked dates (409) to prevent bypass
- **Event Checklists** — new Checklist card on every event detail page; add individual tasks via text input (Enter to submit) or apply a full reusable template from the dropdown; check/uncheck items with real-time progress bar; hover to delete individual items; template management available in Settings → Checklists
- **Settings → Checklists** — new settings tab for creating and managing reusable checklist templates; create templates by entering a name and pasting items one per line; expand any template to add, remove, or reorder individual items; apply templates to events from the event detail checklist widget

---

## [1.9.2] — 2026-06-24

### Changed
- **Support Center — updated for all recent features** — Automation article fully rewritten to cover default pre-seeded templates, automation-first email architecture, correct trigger names, full merge tag reference, and edit-rule capability; new Calendar article covering monthly grid, event/lead color coding, click-to-create, and status legend; new Dashboard article covering stats row, Requires Attention, and Recent Activity sections; new Settings → Profile article; Getting Started Step 7 updated to reflect pre-seeded defaults; two new category cards added (Calendar, Dashboard); Settings category description updated

---

## [1.9.1] — 2026-06-24

### Changed
- **Super admin — status/plan selectors redesigned** — replaced cramped horizontal button groups with a clean vertical list; current selection is shown with a checkmark and muted background; available options are uniform outlined rows with brand-color hover; Cancel is a plain text link below the list; no more wrapping or ambiguous button styles

---

## [1.9.0] — 2026-06-24

### Added
- **Automation — retry on failure + super admin alert** — when an automation email fails to send, Inngest automatically retries up to 3 times with exponential backoff; after all retries are exhausted the execution is marked FAILED and an alert email is sent to the super admin with tenant name, recipient, template, trigger, event, and error details; immediate-execution failures (zero-offset rules) follow the same alert path without Inngest
- **Super admin — Email Activity Log** — new table at the bottom of the super admin console showing every automation email attempt (SENT/FAILED/SKIPPED); filterable by status; click any FAILED row to expand the raw error message; live refresh button; paginated at 50 per page
- **Super admin — failure count badge on operator rows** — any operator with at least one FAILED automation execution shows a red "N email failures" indicator directly on their row in the Operators table; a total failures count also appears in the Email Activity Log header

### Fixed
- **Automation — silent failures** — previously a Resend error was caught inside `executeAutomation` and the job marked FAILED with no retry and no visibility; now errors propagate so Inngest can retry and unrecoverable failures surface to super admin

---

## [1.8.9] — 2026-06-24

### Added
- **Email automation — automation-first architecture** — operators can now fully replace every client-facing transactional email with their own custom template; when an active automation rule covers a trigger (`QUOTE_SENT`, `CONTRACT_SENT`, `INVOICE_SENT`, `PAYMENT_RECEIVED`, `GALLERY_PUBLISHED`), the hardcoded email is suppressed and only the automation email fires; hardcoded emails fall back silently when no rule exists; operator/host notification emails are unaffected and always fire
- **Email automation — pre-seeded default templates + rules for new tenants** — each new tenant is automatically provisioned with 6 ready-to-send email templates and matching automation rules at signup: New Inquiry Auto-Reply, Your Quote is Ready, Contract Ready to Sign, Invoice Ready for Payment, You're Booked! (What Happens Next), and Your Photo Gallery is Ready; operators can edit these at any time in Email Templates / Automation
- **Email automation — seed defaults for existing tenants** — super-admin endpoint `POST /api/super-admin/seed-email-defaults` backfills the 6 default templates and rules for all existing tenants, skipping any that already have a template with the same name; pass `{ tenantId }` in the body to target a single tenant
- **"You're Booked!" confirmation email** — fires on `PAYMENT_RECEIVED` (not contract signing); includes a green payment-confirmed banner, full "What Happens Next" table (🎨 Custom Template Design, ✅ Design Approval, 📸 Event Day, 🖼️ Online Gallery), and a client portal CTA; operators can customize this in their Email Templates
- **Merge tags — `{{portal.link}}`** — added `portal.link` to `MergeCtx` type and `buildCtx()` so templates can link directly to the client portal; was already in the editor dropdown but was previously unresolved

### Fixed
- **Email templates — `{{portal.link}}` unresolved in sent emails** — the editor offered `portal.link` as a merge tag but it was not in the `MergeCtx` type or `buildCtx()` return value; tags resolved to an empty string; now correctly resolves to `https://boothgen.com/portal/<token>`

---

## [1.8.8] — 2026-06-24

### Fixed
- **Email + contract variables — amber styling in rendered output** — visual editor stores merge tags as styled `<span>` elements with amber borders; these spans were reaching sent emails and the contract viewer (both CRM and client portal); added `stripMergeTagSpans()` that removes both `data-tag`-attributed spans and `class="merge-tag"` spans before any HTML is displayed or sent; applied in `parseMergeTags` (email sending path) and both contract rendering locations; the editor still shows amber chips while composing, but rendered output is plain

---

## [1.8.7] — 2026-06-24

### Added
- **Lead capture form — Company / Organization field** — added optional company field to the public embed form; saved to both the `LeadSubmission` record and the client record; includes new `showCompany` toggle in lead form config (defaults to `true`)

---

## [1.8.6] — 2026-06-24

### Added
- **Automation — wire 5 missing triggers** — `CONTRACT_SENT`, `CONTRACT_EXECUTED`, `INVOICE_SENT`, `PAYMENT_RECEIVED`, and `GALLERY_PUBLISHED` were never wired to the automation system; each relevant route now calls `triggerAutomation()` after the action completes so all 13 triggers are functional; event-date triggers (14/7/1 day before, 1/3 days after) still rely on Inngest for scheduling
- **Automation rules — Edit button** — each rule now has a pencil edit button that opens a pre-populated modal to change the rule name, trigger, or email template without deleting and recreating
- **New Event form — Company/Organization field** — operators can now enter a company or organization name when creating a new client through the Add Event form; saved to the client record and shown in the clients list

### Fixed
- **Email templates — merge tag variables rendering in amber color** — the visual editor wraps inserted variables in styled `<span>` elements with orange/amber borders; these spans were being preserved in sent emails, making merge-tag values appear styled; `parseMergeTags` now strips the span wrappers before substituting values so recipients see plain-styled text
- **Email signature — displaying as one line** — the `{{host.signature}}` value was stored as plain text with `\n` newlines; HTML email ignores newlines so the multi-line signature collapsed to one line; newlines are now converted to `<br>` tags before insertion

## [1.8.5] — 2026-06-24

### Fixed
- **Automation — LEAD_CREATED trigger not firing** — the lead submission route never called the automation system; added direct LEAD_CREATED rule execution after each lead is saved: fetches active rules, resolves all merge tags (`{{client.*}}`, `{{event.*}}`, `{{host.*}}`) from lead data and tenant branding, and sends the template email to the client immediately; logs success/failure to Vercel for visibility
- **Lead capture form — company contact info missing** — the embed form only fetched `companyName` and `logoUrl`; now also fetches `supportPhone`, `replyToEmail`, and `websiteUrl` from branding and renders them as a small contact bar below the header (only shown when values are set)

---

## [1.8.4] — 2026-06-23

### Fixed
- **Dashboard — stale revision alert persisting after approval** — the previous query fetched ALL designs with `REVISION_REQUESTED` status including older versions; now queries events where any design is pending revision, then post-filters to only those where the **latest version** is still `REVISION_REQUESTED`; approved newer versions correctly clear the alert

### Changed
- **Dashboard — "Needs Attention" renamed to "Requires Attention"**
- **Dashboard — "Recent Activity" section added** — approved designs from the last 30 days appear as green rows below "Requires Attention", showing client name, version, event title, and time since approval; gives operators a full picture of what's done vs. what needs action

---

## [1.8.3] — 2026-06-23

### Fixed
- **Template design emails — robust recipient resolution** — the approve and request-revision routes previously queried only `HOST_ADMIN` memberships; if that query returned empty (e.g. tenant created outside the onboarding flow), `recipients` was an empty array and no emails were sent silently; now falls back to all active memberships if no HOST_ADMIN members are found, so someone always gets notified
- **Template design emails — detailed logging** — all three routes now log the recipient list, Resend success/failure, and returned message IDs to Vercel logs for easier debugging

---

## [1.8.2] — 2026-06-23

### Added
- **Dashboard — design revision alerts** — template designs where a client requested a revision now appear in the "Needs Attention" section (orange row) with the client name, version number, event title, and the client's revision note; clicking links directly to the event's design page so a new version can be uploaded immediately

---

## [1.8.1] — 2026-06-23

### Fixed
- **Template design — client notification email not sending** — the design upload route called `sendDesignReadyEmail` as a fire-and-forget promise; on Vercel, the serverless function is frozen the moment `NextResponse.json()` returns, killing any unresolved promises before the email could be dispatched; fixed by `await`-ing the call inside a try/catch so the response is only returned after the email is sent
- **Template design — approve/revision host emails not sending** — same root cause: `recipients.forEach(...)` with async callbacks is never awaited; changed both the approve and request-revision routes to `await Promise.all(recipients.map(...))` so host notification emails reliably dispatch before the function returns

---

## [1.8.0] — 2026-06-23

### Added
- **Dashboard — Needs Attention section** — color-coded alert rows for overdue invoices (red), at-risk galleries with photos pending deletion (red), contracts awaiting signature (orange), invoices due within 7 days (yellow), and new leads with no response in 3+ days (purple); each row links directly to the relevant record; shows an "all clear" message when nothing requires action
- **Dashboard — Today's Events** — highlighted card showing all events scheduled for today with client name, venue, status badge, and direct link; only appears when events exist today
- **Dashboard — Weather widget** — 5-day forecast strip (Today + 4 days) using IP geolocation (ipapi.co) and Open-Meteo; shows weather icon, condition label, high/low temps in Fahrenheit, and rain probability when > 20%; loads client-side so it never blocks server rendering

---

## [1.7.1] — 2026-06-23

### Fixed
- **Gallery missing for converted leads** — the lead-to-event convert route was not creating a `Gallery` record; added `gallery: { create: ... }` to match the normal event creation flow; future conversions will always have a gallery
- **Gallery backfill on page load** — the `/gallery` page now auto-creates missing gallery records for any existing events that don't have one; no manual action needed — Ronnette Nolasco's event gallery will appear immediately on next load

---

## [1.7.0] — 2026-06-23

### Fixed
- **Lead compose — template line breaks** — switched `htmlToPlainText` from a regex-based approach to a proper DOM tree walk (`document.createElement('div')` + recursive node extraction); block elements (`P`, `DIV`, `H1`–`H6`, `LI`) now emit `\n\n`, `BR` emits `\n`, and inline elements like `<span>` pass through their text content; correctly handles any editor output structure

### Added
- **Calendar — lead inquiries** — leads with an event date now appear on the calendar as purple "✦ First Last" chips, linking directly to the lead detail page; "Lead Inquiry" added to the calendar legend; fetches leads via new `GET /api/leads` route
- **Dashboard — Recent Leads table** — added a "Recent Leads" card below Upcoming Events showing the 8 most recent leads with name, email, event date, type, and status; "View All" links to `/leads`

---

## [1.6.9] — 2026-06-23

### Fixed
- **Lead compose — template load missing line breaks** — `</p>` now converts to `\n\n` instead of `\n` so paragraph spacing is preserved when stripping HTML to plain text
- **Lead compose — `{{event.*}}` placeholders not resolved** — added full event variable resolution from lead data: `{{event.date}}` (formatted as "Wednesday, July 19, 2025"), `{{event.start_time}}`, `{{event.end_time}}` (12-hour format), `{{event.venue_name}}`, `{{event.venue_address}}`, `{{event.venue_city}}`, `{{event.venue_state}}`, `{{event.venue_zip}}`, `{{event.guest_count}}`

---

## [1.6.8] — 2026-06-23

### Fixed
- **Email template editor — preview leaking raw HTML styles** — the preview was rendering the span element's opening tag (including all inline styles) as visible text; fixed by replacing the full `<span data-tag="...">...</span>` element before doing plain `{{token}}` replacement, so sample values render cleanly as highlighted text

---

## [1.6.7] — 2026-06-23

### Added
- **Lead compose — Load template** — "Load a template…" dropdown in the Compose tab of a lead thread; selecting a template strips HTML to plain text and resolves all placeholders (`{{client.first_name}}`, `{{host.company_name}}`, etc.) against the lead and branding before populating the subject and body fields; dropdown only appears if the tenant has templates saved

---

## [1.6.6] — 2026-06-23

### Added
- **Profile settings page** (`/settings/profile`) — users can now update their display name from the sidebar; name updates immediately without requiring a sign-out thanks to `useSession().update()` + JWT refresh; email is shown read-only; "Profile" tab added to all Settings sub-pages

---

## [1.6.5] — 2026-06-23

### Fixed
- **Support AI chat — final fix** — replaced `@ai-sdk/google` + `streamText` with a direct `fetch` to the Google AI REST API using Gemini's native content schema (`contents[].parts`, `role: model/user`, `system_instruction`); surfaces the actual Gemini error message in the chat rather than a generic "something went wrong" so issues are visible

---

## [1.6.4] — 2026-06-23

### Fixed
- **Support AI chat — "Something went wrong" on every message** — replaced the broken `useChat` / `DefaultChatTransport` / `toUIMessageStreamResponse()` stack with a simple manual `fetch` + `ReadableStream` implementation; server now accepts plain `{ role, content }[]` messages and returns a plain text stream via `toTextStreamResponse()`; client streams the response chunk-by-chunk into state with no AI SDK client dependency

---

## [1.6.3] — 2026-06-23

### Fixed
- **Support AI chat — all messages erroring** — the local welcome bubble (an assistant message) was being sent to Gemini as the first message in the conversation; Gemini rejects conversations that don't start with a user turn; fix: server now slices messages from the first user message before calling `convertToModelMessages`; added try/catch around the route so any future errors return a clean JSON response instead of an unhandled exception

---

## [1.6.2] — 2026-06-23

### Fixed
- **Marketing page — mobile hamburger menu** — nav links were hidden on mobile with no way to access them; extracted header into `MarketingNav` client component with a hamburger (☰ / ✕) toggle that opens a full dropdown panel listing all nav links; closes on link tap

### Added
- **Marketing page — Contact Us section** (`#contact`) — quick contact form embedded above the footer; name, email, topic dropdown, message; submits to existing `/api/support/contact`; shows success confirmation
- **"Contact" link** added to marketing page desktop nav and footer nav
- **`/contact` page** — full standalone contact page with: two-column layout (info sidebar + form), email link, response time notice, Support Center callout, topic guide cards (General / Technical / Billing / Feature / Partnership / Other); uses the shared `MarketingContactForm`
- **`/contact` added to public middleware routes** (no auth required)

---

## [1.6.0] — 2026-06-23

### Changed
- **"Host" → "Operator" rename throughout all UI-facing text** — super admin labels, client portal messages, guest gallery, contract detail page, contract PDF, support page; internal DB fields/enums/API routes unchanged
  - Super admin: "Total Hosts" → "Total Operators", "All Hosts" → "All Operators"
  - Client portal: "The host will be notified" → "The operator will be notified", "The host will send your quote" → "Your operator will send your quote", gallery expired/protected messages updated
  - Guest gallery: access code prompt updated
  - Contract detail: "Host Signed" label → "Operator Signed"
  - Contract PDF: "Host / Provider" → "Operator / Provider", "Host Signature" → "Operator Signature"
  - Support page: "Host Admin Roles" → "Operator Admin Roles"

### Added
- **Operator search in super admin** — search bar in "All Operators" table filters by company name, slug, status, or plan in real time; shows match count
- **Manual plan upgrade/downgrade from super admin** — each operator row now has three action icons:
  - ↑ **Change plan** (purple) — set Commission (FREE_TRIAL), Pro Monthly, or Pro Annual; creates or updates the StripeSubscription record; also sets tenant status to ACTIVE on upgrade
  - ↓ **Change status** (blue) — set account status to Active / Trial / Suspended / Cancelled without affecting plan
  - 🗑 **Delete** (red) — existing delete with confirmation prompt
- **`PATCH /api/super-admin/tenants/[id]`** — extended to handle `{ plan }` in addition to existing `{ status }`; upserts StripeSubscription for manual upgrades (uses `manual_{tenantId}` as stripeCustomerId when no Stripe account exists)
- **`OperatorsTable` client component** — replaces the old static server-rendered table; handles search, plan change, status change, and delete actions with inline confirmation flows

---

## [1.5.9] — 2026-06-23

### Changed
- **Marketing page** — added "Support" link to the top nav and the footer nav, pointing to `/support`

---

## [1.5.8] — 2026-06-23

### Changed
- **Support AI chat — switched from Anthropic to Google Gemini** (`gemini-2.0-flash`); env var is now `GEMINI_API_KEY` instead of `ANTHROPIC_API_KEY`; `@ai-sdk/google` installed; `@ai-sdk/anthropic` no longer used for support chat

### Added
- **"Contact support" panel in AI chat widget** — a "Still need help? Send a message to our team →" footer link in the chat opens a contact form panel with question textarea and optional reply-to email field; submits to `POST /api/support/contact`; shows success confirmation with expected reply info; pre-fills question from last user message in chat if any
- **`POST /api/support/contact`** — public API route that sends an email via Resend to the platform `support_email` address (from SystemSetting); falls back to `EMAIL_FROM` env var if not configured; reply-to set to submitter's email if provided
- **Super admin: Support email setting** — new "Support Contact" card in Platform Settings to configure the email address that receives contact form submissions; saved as `support_email` in `SystemSetting` table; field added to `ALLOWED_KEYS` and loaded in super admin page

---

## [1.5.7] — 2026-06-23

### Added
- **Support Center** (`/support`) — comprehensive public help page with client-side search and AI chat
  - 13 topic categories covering the full product: Getting Started, Leads, Quotes & Proposals, Contracts & Signatures, Invoicing & Payments, Client Portal, Photo Gallery (Pro), Team Management, Automation & Emails, Discounts & Coupons, Workflows, Settings, FAQ
  - 15 detailed help articles covering every major feature with step-by-step instructions
  - Complete end-to-end workflow article: Lead submission → Quote → Contract signing → Deposit → Gallery → Balance → Automated review request
  - Client-side search (`SupportSearch`) — searches article titles, categories, and content with highlighted snippet previews; debounced, no server round-trip
  - AI chat widget (`SupportChat`) — floating orange button (bottom-right); opens a 400px chat panel with the Booth Genius AI assistant powered by Claude Haiku; uses AI SDK v6 (`useChat` + `DefaultChatTransport`); context-aware system prompt covering all product features, plans, and common Q&A
  - **`POST /api/support/chat`** — streaming chat API using `streamText` + Anthropic Claude Haiku 4.5; requires `ANTHROPIC_API_KEY` env var; returns 503 gracefully if not configured
  - `/support` and `/api/support` added to public middleware routes (no auth required)
  - Installed packages: `ai` (v6), `@ai-sdk/anthropic`, `@ai-sdk/react`

---

## [1.5.6] — 2026-06-23

### Added
- **Coupon / discount system** — operators can create reusable discount codes and apply discounts to quotes
  - `Coupon` model with code, type (PERCENTAGE / FIXED_AMOUNT), value, max uses, expiry, active toggle, and usage count
  - `DiscountType` enum added to schema; `couponId` and `discountLabel` fields added to `Quote`
- **Settings → Coupons** page — create, activate/deactivate, and delete coupon codes; table shows code, discount value, usage count, expiry, and status; used coupons can be deactivated but not deleted
- **`GET/POST /api/settings/coupons`** — list and create tenant coupons
- **`PATCH/DELETE /api/settings/coupons/[id]`** — toggle active, update, or delete (only unused coupons)
- **Discount section in quote builder (new & edit)** — "Add discount or coupon" toggle below line items; supports % percent, $ fixed, or saved coupon code; live discount preview shows amount saved; discount line appears in totals; coupon usage count incremented on quote create, adjusted on edit
- **"Coupons" tab** added to all settings page navigation (Branding, Packages, Billing, Team, Coupons, Lead Capture)

### Changed
- **`POST /api/quotes`** and **`PATCH /api/quotes/[id]`** — now accept `discountCents`, `discountLabel`, and `couponId`; validate coupon is active, not expired, and within max uses; adjust `usedCount` on create/edit
- **Portal already shows discount** — the portal quote view renders `discountCents` as a green discount line (was already in place)

---

## [1.5.5] — 2026-06-23

### Added
- **Team member access permissions** — operators can now control which sidebar sections team members can see, from Settings → Team → "Team Member Access"
  - 7 toggleable modules: Events, Calendar, Leads & Messages, Quotes, Invoices, Clients, Gallery (Pro)
  - Applies to all team members on the account (not per-individual)
  - Default access: Events only (existing behavior preserved)
  - `teamMemberAccess String` column added to `tenants` table via Prisma migration
- **`PATCH /api/settings/team/access`** — new route to save the JSON array of enabled modules; HOST_ADMIN only; validates against allowed module list; requires at least one module
- **`TeamAccessForm` client component** — checkbox grid in Settings → Team for toggling module access; shows save confirmation; applies immediately on next team member login

### Changed
- **Sidebar (`Sidebar.tsx`)** — team member nav now built dynamically from `teamMemberAccess` (fetched via `/api/settings/branding`); `TEAM_NAV_MAP` maps module IDs to nav items so order follows operator selection
- **`GET /api/settings/branding`** — now includes `teamMemberAccess` string from the `Tenant` record

---

## [1.5.4] — 2026-06-23

### Changed
- **Marketing page — "Genius" branding throughout** — page rewritten around the "Genius" concept; hero headline changed to "6 tools. 1 platform. That's the Genius of it."; hero background now matches brand purple (`#1e1247 → #2D1B69` gradient) to tie into app identity; final CTA section uses matching dark gradient
- **Marketing page — Genius Pillars row** — new 6-column row below hero listing Booking Genius, Billing Genius, Contract Genius, Gallery Genius, Portal Genius, Automation Genius as named value props
- **Marketing page — savings comparison section** (`#savings`) — side-by-side "The Old Way vs The Genius Way" showing all 7 tools operators typically pay for à la carte (~$141+/month) vs Booth Genius at $0/month to start; includes visual table with ✗ old-way costs and ✓ Genius "Included" checkmarks; nav link renamed "Why Genius?"
- **Marketing page — feature section labels** — showcase sections now use Genius sub-brand labels (Portal Genius, Contract Genius, Gallery Genius)
- **Marketing page — quote copy sharpened** — gallery section copy updated to "without a second subscription"; contract section updated to remove DocuSign name; founder story ending updated to use "That's the Genius of it" phrasing
- **Marketing page — footer tagline** — added "The Genius way to run your photo booth business." under the logo

---

## [1.5.3] — 2026-06-23

### Added
- **Marketing page — "Built by an operator" story section** — new dark-background section with narrative copy about the founder running 2 photo booth businesses for 10+ years; no names or business names mentioned; includes four stat callouts (10+ years, 2 businesses, 100s of events, 1 platform)
- **Marketing page — split-panel hero with dashboard mockup** — hero rewritten to a two-column layout; left column has headline + CTAs, right column shows a detailed HTML/CSS dashboard UI mockup (stats cards, event list, sidebar)
- **Marketing page — client portal UI mockup** — new "One link. Everything your client needs." section with a portal mockup showing the Invoice tab (line items, balance due, pay button), navigation tabs with completion indicators, and client/event header
- **Marketing page — quote/e-signature UI mockup** — alternating-layout feature section showing the quote line-item table and typed digital signature acceptance flow
- **Marketing page — guest gallery UI mockup** — feature section showing the `/g/[token]` gallery page with photo grid, download-all button, and amber expiry notice
- **Marketing page — mobile portal phone frame mockup** — new "Works perfectly on mobile" section with a phone-frame mockup showing the gallery tab on a mobile viewport
- **Marketing page — nav anchor links** — nav now links to `#features`, `#how-it-works`, `#pricing`, and `#our-story` for single-page scroll navigation; "Our Story" added as a nav item

---

## [1.5.2] — 2026-06-23

### Added
- **Gallery Pro gating** — gallery list page and all gallery API routes (`GET /api/gallery/[id]`, `PATCH`, `POST /upload`) now require an active Pro subscription (plan `MONTHLY` or `ANNUAL`, status `ACTIVE` or `PAST_DUE`). Commission-plan users see a lock screen with an upgrade prompt. A `hasProAccess(tenantId)` helper added to `src/lib/auth/session.ts`.
- **Pro badge in sidebar** — Gallery nav item shows a yellow "PRO" pill to communicate the plan requirement at a glance.
- **Marketing page — real Booth Genius logo** — nav and footer now use the `BoothGeniusLogo` SVG component instead of the camera emoji.
- **Marketing page — new/small operator focus** — hero headline and trust bar rewritten to explicitly target new and small photo booth operators; commission plan copy clarifies gallery is a Pro upgrade.
- **Marketing page — gallery marked Pro** — Photo Gallery feature card has a yellow "Pro" badge; footnote below the grid explains which features are included in the free commission plan.

---

## [1.5.1] — 2026-06-23

### Added
- **Gallery deletion reminder email to host** — daily cron at 10 AM UTC finds galleries whose permanent deletion date is exactly 2 days away (based on `eventDate + expireDays + deleteDays`) and sends a warning email to all HOST_ADMIN members of that tenant. Email shows gallery title, event name, photo count, and exact deletion date with a direct "Download Photos Now" link to the admin gallery page.

---

## [1.5.0] — 2026-06-23

### Added
- **Marketing homepage** — full SEO- and mobile-optimized marketing page at `/` for unauthenticated visitors; highlights all CRM features, commission-based "you don't make money, we don't make money" pricing model, Pro subscription plan, client portal preview, and a 3-step "how it works" section; pricing (monthly, annual, commission %) pulled live from super admin settings
- **Commission % setting** — super admin can now define the platform commission percentage shown on the marketing page (via Platform Settings → Stripe Billing → Commission Plan); exposed via `/api/public/pricing`
- **Guest gallery expiry notice** — the public `/g/[token]` gallery share page now shows an amber banner with the exact date photos will be removed, matching the client portal behavior
- **Leads module** verified complete — list view, lead detail with email reply/thread, status management, internal notes, venue details, and one-click convert-to-event all working; linked in sidebar as "Leads & Messages"
- **Team invite flow** verified complete — invite form on Settings → Team page sends email with tokenized link; `/invite/[token]` accept page handles new-user password creation and existing-user join; fully end-to-end

### Fixed
- **`/invite` routes now public** — added `/invite` and `/api/invite` to middleware PUBLIC list so unauthenticated recipients can accept team invitations without being redirected to sign-in
- **`/leads` added to middleware TENANT routes** — ensures users without a tenantId are redirected to onboarding instead of reaching leads pages
- **Marketing page accessible without auth** — added `/` to middleware PUBLIC list

---

## [1.4.2] — 2026-06-23

### Added
- **Gallery share reminder banner** — prominent blue info box in the client portal gallery tab reminding clients to use "Share Gallery Link" with guests instead of sharing the portal URL directly, which would expose their quote, contract, and payment details.
- **Secure gallery share link** — "Share Gallery Link" button on both the host gallery page and the client portal gallery tab now copies a dedicated `/g/[clientToken]` URL. This route is fully separate from the portal: it only returns gallery photos and branding, never any quote, contract, invoice, or design data. The client token is a random cuid — unguessable from the portal token. Guests who receive this link cannot strip parameters to reach private financial information.
- **Gallery expiry notice in client portal** — when the gallery is published and not yet expired, an amber banner appears below the photo grid stating the exact date photos will be removed, with a prompt to download before then.

### Changed
- **Gallery-only share link** replaced: the previous approach used `?galleryOnly=1` on the portal URL (which only hid tabs in the UI but still exposed the portal token). The new `/g/[token]` route is completely isolated.

---

## [1.4.1] — 2026-06-23

### Added
- **Gallery retention reminder** — host gallery detail page shows an amber banner with the exact dates photos will be hidden from the portal and permanently deleted from storage, calculated from the event date using the super admin gallery retention settings (Days until expiry + Additional days until deletion); turns red if the gallery has already expired

---

## [1.4.0] — 2026-06-23

### Added
- **Gallery publish notification** — client receives an email with a "View Your Gallery" button the moment the operator clicks "Publish to Client"
- **Gallery-only share link** — "Share Gallery Link" button appears on the gallery detail page (after publishing); copies a portal URL with `?galleryOnly=1` that hides all other tabs (Quote, Contract, Invoice, Design) — safe to share with guests who shouldn't see billing details
- **Photo lightbox** — clicking any photo in the client portal opens a full-screen modal with the photo, prev/next arrows, a photo counter, and a Download button; tap outside or the × to close
- **Gallery payment gate** — if any invoice milestone is overdue and balance > 0, the gallery tab shows a "Payment Required" screen with a link to the invoice instead of the photos
- **Overdue payment reminder emails** — daily cron at 2 PM UTC sends reminder emails to clients with overdue payment milestones (past due date, not yet paid); shows amount due, original due date, and direct Pay Now link to the portal invoice tab
- **Delete All Photos** — "Delete All N Photos" button on the gallery admin page (with confirmation) removes all assets from both R2 storage and the database in one action; accessible via `DELETE /api/gallery/[id]/assets`

---

## [1.3.3] — 2026-06-23

### Fixed
- **Gallery photo uploads now work** — resolved a multi-layer CORS issue with direct browser-to-R2 presigned uploads: (1) added `forcePathStyle: true` to the R2 S3 client so presigned URLs use path-style (correct endpoint), (2) applied CORS via `PutBucketCorsCommand` (S3 API level) — the Cloudflare Dashboard CORS policy applies to the public `r2.dev` URL only, not the `cloudflarestorage.com` S3 API endpoint used by presigned PUTs, (3) added `https://www.boothgen.com` to allowed origins (app is served on `www`). Added `POST /api/super-admin/r2-cors` to apply the CORS policy programmatically.

---

## [1.3.2] — 2026-06-22

### Fixed
- **Gallery bulk upload stuck on large sets** — uploading 250+ photos was sequential (one at a time), causing the page to hang and render 250+ individual progress bars. Now uploads 5 photos concurrently and shows a single aggregate progress bar (e.g. "47 / 250"). A new `POST /api/gallery/[id]/assets/batch` endpoint saves all successful records in one `createMany` call instead of 250 individual DB round-trips. Errors on individual files are counted and reported without stopping the rest.

---

## [1.3.1] — 2026-06-22

### Added
- **Sign out button on super admin** — "Sign Out" button now appears in the top-right of the super admin header bar; extracted as a `SuperAdminSignOut` client component that calls `signOut({ callbackUrl: '/sign-in' })`
- **Display price inputs in super admin** — Stripe Billing card in Platform Settings now has "Monthly Price" and "Annual Price" text inputs (e.g. `$49/mo`, `$399/yr`) stored as `price_display_monthly` / `price_display_annual` in `SystemSetting`; values are surfaced via a new unauthenticated `GET /api/public/pricing` endpoint so the marketing page can fetch them without auth

---

## [1.3.0] — 2026-06-22

### Added
- **Calendar view** (`/calendar`) — month grid showing all events color-coded by status (Lead=blue, Quoted=yellow, Booked=orange, In Progress=brand, Completed=green); prev/next month navigation + Today button; clicking a date pre-fills the new event form with that date; clicking an event opens the detail page; legend at bottom; added to sidebar as "Calendar" between Dashboard and Events
- **PDF export** — "Download PDF" button on invoice, quote, and contract detail pages; server-side generation via `@react-pdf/renderer` with no browser dependency; PDFs include company branding (name, email, website), client info, line items table, and totals; contract PDFs strip HTML from `renderedContent` and include signature blocks with timestamps; routes: `GET /api/invoices/[id]/pdf`, `GET /api/quotes/[id]/pdf`, `GET /api/contracts/[id]/pdf`
- **Analytics page** (`/analytics`) — four KPI tiles (Revenue 12mo, Total Clients, Total Booked, Avg Booking Value); Revenue by Month bar chart (last 12 months from paid milestones); Bookings & Leads by Month line chart; Conversion Funnel showing Leads→Quoted→Booked→Completed with percentage conversion; Event Status Distribution donut chart; data served from `GET /api/analytics`; added to sidebar as "Analytics" above Automation

---

## [1.2.1] — 2026-06-22

### Added
- **Gallery password protection** — hosts can set an access code on any gallery from the gallery detail page (Gallery → [event] → Password Protection card); when set, the client portal gallery tab shows a branded code-entry screen instead of photos; correct code re-fetches the full asset list; code can be cleared with "Remove access code"; `Gallery.accessCode` field was already in the schema; portal API strips the actual code from the response and returns `requiresAccessCode` / `galleryUnlocked` flags only
- **Stripe price IDs in super admin** — `stripe_price_monthly_id` and `stripe_price_annual_id` are now editable in Super Admin → Platform Settings (Stripe Billing card) and stored in `SystemSetting`; the billing checkout and platform webhook both read from DB first, falling back to env vars; no redeploy needed to change pricing

---

## [1.2.0] — 2026-06-22

### Added
- **Billing / Upgrade to Pro flow** — "Upgrade to Pro" button on Settings → Billing now creates a real Stripe Checkout Session and redirects there; existing subscribers see a "Manage Subscription" button that opens the Stripe Customer Portal; `POST /api/stripe/billing/checkout` and `GET /api/stripe/billing/portal` routes created; platform webhook now handles `checkout.session.completed` to correctly set `tenantId` and `plan` on `StripeSubscription`; also handles `customer.subscription.deleted`
- **Estimated value on new event form** — "Estimated Value ($)" field added to the new event form (was previously only on the edit form); API already accepted the field
- **Dashboard KPIs** — three new metric tiles added: Booked Pipeline (sum of `estimatedValueCents` for BOOKED/IN_PROGRESS events), Outstanding Balance (sum of `balanceDueCents` on unpaid invoices), Conversion Rate (booked ÷ total non-cancelled events); grid now supports 7 tiles across XL screens
- **Quotes status filtering** — filter pill buttons above the quotes table let users show All / Draft / Sent / Viewed / Accepted / Declined / Expired; pill shows count for each status; client-side, no API change
- **Invoices status filtering** — same filter pattern applied to invoices list; page converted from server component to client component to support client-side filtering; invoices API GET now includes `PaymentMilestone` so next-due-date logic works correctly
- **Gallery download** — client portal gallery tab now shows a "Download All" button (creates a zip via JSZip, fetches all photos, downloads as `gallery.zip`); each photo grid cell shows a hover download icon for individual downloads; installed `jszip`
- **Lead form embed customization** — tenants can now control the embeddable inquiry form from Settings → Lead Capture: form heading, submit button text, success heading/message, which optional fields to show (phone, event date, event type, times, guest count, venue, notes), and which to require; config saved as `leadFormConfig` JSON in `TenantBranding` (schema pushed); embed route reads config and applies it; `{{company}}` placeholder in heading is replaced with company name at render time

---

## [1.1.0] — 2026-06-22

### Added
- **Mark as paid externally** — admin can mark any unpaid milestone as received outside Stripe (cash, check, Venmo, etc.) via the $ icon on the Payment Schedule card; triggers a confirm step before saving; automatically recomputes invoice `amountPaidCents`, `balanceDueCents`, `status` (PARTIALLY_PAID → PAID), and advances event to BOOKED. Gated to paid plan subscribers (MONTHLY/ANNUAL) — trial accounts see a lock icon with an upgrade prompt
- **Stripe Connect guard on quote send** — sending a quote now requires the tenant's Stripe account to have `chargesEnabled`; returns a clear error with a link to Settings → Billing; prevents clients from receiving a quote with a broken payment page
- **Event estimated value** — new optional "Estimated Value ($)" field on event create and edit forms; displayed on the event detail page; stored as `estimatedValueCents` on the Event model (schema pushed)

### Changed
- `MilestonesCard` now accepts `isAdmin` and `isPro` props to conditionally show the date-edit pencil and external mark-paid button
- `REFUNDED` milestone status now displays with a warning badge color

---

## [1.0.9] — 2026-06-22

### Changed
- **Platform email template editor is now WYSIWYG** — replaced the raw HTML textarea with the full visual editor (bold, italic, underline, align, lists, link, image, HTML toggle, preview); "Insert Variable" dropdown shows only the platform-relevant variables (`{{user_name}}`, `{{app_url}}`, `{{reset_url}}`); preview mode substitutes sample values highlighted in orange
- `EmailTemplateEditor` now accepts optional `mergeTags` and `previewSamples` props so it can be reused with any variable set

---

## [1.0.8] — 2026-06-22

### Fixed
- **Forgot password page accessible without login** — `/forgot-password` and `/reset-password` were missing from the public route list in middleware; authenticated redirect prevented unauthenticated users from ever reaching the form

### Added
- **Welcome email on signup** — new users receive a welcome email immediately after creating their account; uses the platform template if customized, otherwise a built-in default
- **Platform email templates in super admin** — new "Platform Email Templates" card in the super admin console; edit subject and HTML body for Welcome Email and Forgot Password emails; click variable chips (`{{user_name}}`, `{{reset_url}}`, etc.) to insert at cursor; toggle Preview to see rendered output with highlighted variables; templates saved to `SystemSetting` and picked up automatically by the respective routes

---

## [1.0.7] — 2026-06-22

### Added
- **Refund options on event cancellation** — "Cancel Event" now shows a panel with three choices: No Refund (keep all payments), Refund Deposit (returns the first paid milestone via Stripe), and Refund All Payments (returns every collected payment). Disabled options show when no payment has been collected. Stripe refunds are issued through the tenant's Connect account; if a payment was collected outside Stripe the milestone is marked REFUNDED without an API call
- **REFUNDED milestone status** — `PaymentMilestoneStatus` enum extended with `REFUNDED`; schema pushed

### Fixed
- **Sidebar version number** — was hardcoded to v0.9.0; now reads from `src/lib/version.ts` and updated to v1.0.7

---

## [1.0.6] — 2026-06-22

### Fixed
- **Email automations now deliver reliably** — Lead Created, Quote Sent, and Booking Confirmed automations were silently failing because they depended on Inngest receiving and processing two sequential events in a serverless environment (Inngest was not reliably delivering). All three automation triggers now call `triggerAutomation` directly from their respective API routes; rules with `triggerOffsetHours === 0` execute the email synchronously in the same request without any Inngest hop. Delayed rules (event date offsets) still schedule via Inngest as before. The Inngest `processAutomation` function also delegates to the same shared `executeAutomation` function so both paths stay in sync

---

## [1.0.5] — 2026-06-22

### Fixed
- **Template design notifications** — removed Inngest dependency for design emails; client notification on upload and operator notifications on approval/revision now send directly via Resend, eliminating the Inngest relay that was silently failing
- **Quote default payment schedule** — Deposit + Balance is now the default selection; Full Payment only activates when forced by the full-payment window setting
- **Events sorted by event date ascending** — upcoming events appear first in the list

### Added
- **Cancel Event** — "Cancel Event" button on the event detail page (admin only) marks the event as CANCELLED with a confirm step; status badge updates immediately; cancelled events cannot be cancelled again

---

## [1.0.4] — 2026-06-22

### Fixed
- **Invoice detail page crash** — `fmt` function cannot be passed as a prop from server to client component (Next.js serialization error); moved `fmt` into `MilestonesCard` client component
- **"Due" column on invoice list** — was always showing `—` because `inv.dueDate` is null on milestone-based invoices; now shows the next unpaid milestone due date

---

## [1.0.3] — 2026-06-22

### Fixed
- **Balance due date on auto-generated invoice** — contract signing route used `event.date` (undefined) instead of `event.eventDate`; balance milestone was always falling back to today. Now correctly calculates `eventDate − balanceDueDaysBeforeEvent`

### Added
- **Payment schedule on invoice detail** — invoice page now shows the Payment Schedule card with each milestone, its status, and due date
- **Editable milestone due dates** — pencil icon on unpaid milestones lets admins correct due dates without recreating the invoice; paid milestones are locked

---

## [1.0.2] — 2026-06-22

### Fixed
- **Event status advancement on deposit payment** — event now advances from LEAD/QUOTED → BOOKED as soon as any payment is received (deposit or full); previously the status was not updated after partial/deposit payment via Stripe webhook or portal reconciliation

---

## [1.0.1] — 2026-06-22

### Added
- **Global Search** — search bar in the top bar (or press ⌘K) searches across clients, events, invoices, and contracts; keyboard-navigable results with category icons
- **Add Event from Client** — client detail page now has a "New Event" button; clicking it opens the New Event form with the client pre-selected
- **Existing client selection on New Event** — toggle between "New Client" and "Existing Client" when creating a new event; live client search with name/email filtering; arriving via client page auto-locks the client
- **Leads & Messages** — "Leads" renamed to "Leads & Messages" in the sidebar to reflect the message thread feature

---

## [0.9.9] — 2026-06-22

### Fixed
- **Template design auto-notification** — uploading a design now immediately sets status to `PENDING_APPROVAL` and fires the client review email; the separate "Request Approval" button has been removed (upload = send for review)
- **Design portal visibility** — designs appear in the client portal immediately after upload since they are no longer created in `DRAFT` state
- **Team member notifications** — bell icon now shows only events, payments, and contracts related to events assigned to that team member; leads and replies are hidden (team members have no access to those pages)

---

## [0.9.8] — 2026-06-22

### Added
- **Team member role restrictions** — TEAM_MEMBER users now see only Events in the sidebar; middleware blocks access to Dashboard, Clients, Leads, Quotes, Invoices, Contracts, Gallery, Automation, Email Templates, Settings
- **Team member event view** — event detail page hides action buttons (Edit, Create Quote, Create Invoice, Delete), Client Portal link, Invoices section, and Contracts section for team members; client info is read-only
- **Event Notes** — new timestamped notes section on every event detail page; all team members can add notes; each note records the author name and exact date/time; visible to both admins and team members
- `EventNote` model added to schema and pushed to database

---

## [0.9.7] — 2026-06-22

### Fixed
- **Template Design upload** — switched from browser-to-R2 presigned URL (CORS-blocked) to server-side upload via FormData; upload now works reliably with meaningful error messages
- **Event status progression** — sending a quote now advances event from LEAD → QUOTED; quote acceptance already advanced to BOOKED
- **Assigned To overflow** — dropdown no longer bleeds outside the card on the event detail page

### Added
- **Design watermark overlay** — image thumbnails in Design History show a status badge overlay (DRAFT / Review / Revision) until the design is APPROVED; approved designs show clean thumbnails

---

## [0.9.6] — 2026-06-22

### Fixed
- **Host countersign error** — "Invalid request" when countersigning a contract; `signerName` is now optional for host signing since the host is already authenticated via session

---

## [0.9.5] — 2026-06-22

### Fixed
- **New Quote deposit %** — now pre-fills from the default deposit % set in Settings → Billing → Payment Terms (was hardcoded to 50%)
- **Auto-generated invoice from quote acceptance** — deposit milestone due date is today; balance milestone due date now calculated from event date minus `balanceDueDaysBeforeEvent` (was both set to today)
- Balance due date also respects tenant's `balanceDueDaysBeforeEvent` branding setting when auto-creating invoices on contract signing
- **New Invoice "Add from Packages"** — package quick-add buttons now appear on the New Invoice form, matching the New Quote experience
- **Balance due date in deposit summary** — both New Quote and New Invoice show the actual balance due date (e.g. "$700.00 due June 10, 2026") calculated from event date minus `balanceDueDaysBeforeEvent`
- **New Quote full-payment enforcement** — "Deposit + Balance" option is hidden and a warning banner shown when the selected event is within the full payment window (same logic as New Invoice)

---

## [0.9.4] — 2026-06-22

### Added
- **Payment Terms settings** — new card on Settings → Billing to configure default deposit %, balance due days before event, and full-payment window (days)
- **Smart invoice defaults** — New Invoice page loads payment term defaults from settings; when an event is selected, deposit % and balance due date are auto-populated
- **Full-payment enforcement** — if the event is within the configured "full payment window" (e.g. 14 days), deposit option is hidden and a warning banner requires full payment at booking
- **Separate milestone due dates** — Deposit and Balance now each have their own due date fields; balance due date auto-calculates as `event date − balance due days`
- `defaultDepositPercent`, `balanceDueDaysBeforeEvent`, `fullPaymentIfWithinDays` fields on `TenantBranding` (schema already pushed)

### Fixed
- **Milestone due dates** — both Deposit and Balance milestones no longer share the same due date; each uses its own `depositDueDate` / `balanceDueDate` from the invoice form

---

## [0.9.3] — 2026-06-22

### Fixed
- **Milestone payment reconciliation** — portal now checks each unpaid milestone's Stripe payment intent on load; deposit/partial payments correctly update `amountPaidCents`, `balanceDueCents`, and invoice status (`PARTIALLY_PAID` / `PAID`) even when webhook fires late

---

## [0.9.2] — 2026-06-22

### Added
- **Notification polling** — bell fetches new activity every 30 seconds in the background
- **Sound alert** — pleasant C major chime plays when new notifications arrive during polling
- **Mark as read** — unread notifications highlighted with orange tint and red dot; click any notification to mark it read; "Mark all read" button clears all at once
- **Unread badge** — bell badge now shows only unread count, not total; "All caught up" footer when everything is read
- Read state persisted in `localStorage` — survives page refreshes

---

## [0.9.1] — 2026-06-22

### Added
- **`scripts/backup.sh`** — pg_dump → gzip → GPG encrypt → local `~/boothgen-backups/` + Google Drive via rclone; 30-day auto-purge on both destinations; colored output and summary
- **`scripts/restore.sh`** — interactive restore from local or Google Drive (auto-downloads if not local); merges both sources into one sorted list; restore options: DB / .env / schema / DB+schema / everything; requires typing `YES` before any destructive action
- **`scripts/setup-backup-schedule.sh`** — installs/removes a macOS launchd job that runs `backup.sh` daily at 3 AM; logs to `~/boothgen-backups/logs/`; accepts `uninstall` argument
- Version number (`v0.9.0`) displayed in sidebar footer
- `CHANGELOG.md` — living changelog, updated with every release

---

## [0.9.0] — 2026-06-21

### Added
- **Team member event assignment** — HOST_ADMINs can assign any event to a team member via dropdown on the event detail page
- **Role-scoped event visibility** — TEAM_MEMBERs only see events assigned to them; HOST_ADMINs see all events with an "Assigned To" column
- **Assignment notification email** — team member receives an email with event details and a direct link when assigned
- **"Assigned To" card** on event detail page — shows dropdown for admins, assignee name for team members
- TEAM_MEMBER access guard — 404 if a team member tries to access an event not assigned to them
- "Showing your assigned events" notice and disabled "New Event" button for TEAM_MEMBER role

---

## [0.8.0] — 2026-06-21

### Added
- **Gallery expiry** — nightly Inngest cron marks galleries as expired after a configurable number of days post-event
- **Gallery purge** — second cron permanently deletes expired galleries and all R2 assets after an additional configurable window
- **Gallery retention settings** in super admin panel — "Expire after" and "Delete after" fields with live total-days summary
- `isExpired` flag on Gallery model; expired galleries show "Expired" badge in the gallery list
- "Gallery Expired" placeholder in client portal gallery tab when `isExpired` is true
- `gallery_expire_days` and `gallery_delete_days` stored as `SystemSetting` key-value pairs

---

## [0.7.0] — 2026-06-20

### Added
- **Payment confirmation email** — client receives a formatted email with "What happens next" steps after invoice is paid
- **"What happens next" panel** in client portal — Design Review → Your Event → Online Gallery, shown after payment
- **Host notification emails** for all three client milestones: quote accepted, contract signed, invoice paid
- Host notifications sent to every HOST_ADMIN member of the tenant
- Server-side Stripe PI reconciliation in the portal API — payment status resolves correctly even if webhook fires late

---

## [0.6.0] — 2026-06-20

### Added
- **Gallery CRUD API** — `GET /api/gallery/[id]`, `PATCH /api/gallery/[id]`, `DELETE /api/gallery/[id]/assets/[assetId]`
- **Gallery auto-creation** — every new event automatically gets an associated gallery
- Gallery list rows are now clickable links to the gallery detail page
- "Expired" badge on gallery list for expired galleries

### Fixed
- Gallery asset field `originalFileName` corrected to `filename` to match Prisma schema
- Removed non-existent `tenantId` field from GalleryAsset create/query

---

## [0.5.0] — 2026-06-19

### Added
- **Template design approval workflow** — operators upload design files per event; clients review, approve, or request revisions from the client portal
- Design versioning with status tracking: `DRAFT → PENDING_APPROVAL → APPROVED / REVISION_REQUESTED`
- Email to client when a new design is ready for review
- Email to operator when client approves or requests changes (with revision note)
- "Manage Designs" section on event detail page
- Template Designs tab in the client portal
- `POST /api/events/[id]/template-designs` — upload design with presigned R2 URL
- `PATCH /api/events/[id]/template-designs/[designId]` — client approve/request revision

---

## [0.4.0] — 2026-06-18

### Added
- **Stripe Connect payments** — tenants connect their Stripe account; clients pay invoices and milestones through the portal
- Platform fee collection on every transaction
- Payment milestone support — partial payments tracked with `PaymentMilestone` records
- Stripe webhook handler — marks invoices as PAID and updates milestone balances on `payment_intent.succeeded`
- Stripe Connect OAuth callback — stores `stripeAccountId` and live/test mode flag
- `POST /api/public/stripe/payment-intent` — creates payment intents for portal payments
- Invoice status lifecycle: `DRAFT → SENT → PARTIALLY_PAID → PAID`

---

## [0.3.0] — 2026-06-16

### Added
- **Client portal** — token-gated page at `/portal/[portalToken]` with tabs for Quote, Contract, Invoice, Design, and Gallery
- **Quote acceptance** — client can accept a quote directly from the portal; status updates to `ACCEPTED`
- **Contract e-signing** — client signs contract from portal; signature and timestamp recorded; status advances to `CLIENT_SIGNED`
- **Notification bell** — in-app notification center for team members; marks notifications as read
- `sendContractLink`, `sendInvoiceLink`, `sendQuoteLink` transactional emails
- Portal token generated per event for secure, shareable client access

---

## [0.2.0] — 2026-06-14

### Added
- **Quote builder** — line items, discounts, tax, subtotal; send to client via email; PDF export via `@react-pdf/renderer`
- **Contract templates** — reusable templates with merge tags (`{{client_name}}`, `{{event_date}}`, etc.)
- **Lead management** — lead capture form embedded via `<iframe>`; email-inbound webhook parses reply emails into lead notes
- **Team management** — invite team members by email; accept invite flow; manage roles (HOST_ADMIN / TEAM_MEMBER)
- **Gallery** — photo upload to Cloudflare R2 via presigned URLs; publish/unpublish; access code protection
- **Automation triggers** — configure email automations for quote sent, contract signed, etc.
- **Email templates** — rich HTML template editor for outbound emails
- `POST /api/public/[tenantSlug]/leads` — public lead submission endpoint
- `POST /api/webhooks/email-inbound` — parses inbound email replies and attaches as lead notes (Svix-verified)

---

## [0.1.0] — 2026-06-01

### Added
- **Multi-tenant architecture** — each photo booth company is an isolated tenant; tenant resolved from session
- **Authentication** — NextAuth v4 with credentials provider; multi-tenant JWT (`tenantId`, `tenantRole`, `tenantSlug`)
- **Onboarding flow** — new tenant setup: company name, slug, Stripe Connect, branding
- **Event management** — create, view, and edit events; link clients, invoices, and contracts
- **Client management** — create and manage client records; search and filter
- **Dashboard** — KPI summary (revenue, events, leads); upcoming events list
- **Branding settings** — company name, logo upload (Cloudflare R2), accent color
- **Sidebar navigation** with company logo and role-aware links
- **Super admin console** — platform-level management for the BoothGen operator
- Prisma ORM with Neon Postgres; `prisma db push` schema workflow
- Inngest for background jobs and scheduled crons
- Resend for transactional email
- Deployed on Vercel at boothgen.com
