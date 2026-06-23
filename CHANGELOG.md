# Changelog

All notable changes to BoothGen (Booth Genius) are documented here.

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
