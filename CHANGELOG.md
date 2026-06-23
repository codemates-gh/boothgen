# Changelog

All notable changes to BoothGen (Booth Genius) are documented here.

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
