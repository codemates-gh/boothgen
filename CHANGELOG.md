# Changelog

All notable changes to BoothGen (Booth Genius) are documented here.

---

## [0.9.5] — 2026-06-22

### Fixed
- **New Quote deposit %** — now pre-fills from the default deposit % set in Settings → Billing → Payment Terms (was hardcoded to 50%)

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
