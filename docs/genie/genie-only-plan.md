# Genie only accounts: plan (for discussion, nothing built)

Status: **planning only** (G, 2026-11-14). Decisions recorded below. No code, schema or production changes until G says go.

## The idea

An operator who doesn't want BoothGen's CRM signs up for **Genie only**. They get the iPad booth and everything
that feeds it: events, Genie settings, templates and designer, props, backdrops, devices, sharing (SMS/email), the guest
photo pages and galleries. They don't see leads, clients, quotes, invoices, contracts, automation, the calendar or the
analytics. They can upgrade to the full CRM later without losing anything.

## G's flow (sketch, 2026-11-14)

```
                 boothgen.com → Sign up / in
               ┌──────────────┴──────────────┐
            Genius (CRM)                  Genie
  Leads → Clients → Quote →             Events
  Invoice ⇄ Contract → Events              │
               └──────────→ Design ←───────┘
                              ↓
          Genie app (or another booth app, Genius only)
                              ↓
                           Gallery → Finish
```

What it settles or suggests:
- **One front door**: sign up or in on boothgen.com; the account's product decides which path the operator sees.
- **Shared second half**: both paths meet at Design, then capture, Gallery and Finish. Design and Gallery are not CRM
  features; they belong to both products.
- **Genie only starts at Events**: no leads, clients, quotes, invoices or contracts.
- **Genius can use another booth app**: a Genius account doesn't need Genie; photos from another app still reach the
  Gallery (as today). So there are three combinations: Genius, Genius + Genie, Genie only.
- **Invoice and contract go in either order** in Genius (as today).

## G's direction (2026-11-14, still thinking)

- **Open sign-up, Genie by default.** Anyone can sign up and becomes a Genie user. Genie is the default path and the
  page they land on. The CRM (Genius) is a choice at sign-up and is promoted inside the app.
- **Genie is paid per event**, not monthly. Maybe Genius too, so extra users (team members) aren't charged for.
- Open: one account with both products? Does "Design" on the Genie side mean only the booth template?

Suggestions (Claude):
- **Charge when the event goes live on the iPad**, not at creation; setup, design and test shots stay free. A free first
  event can replace a trial. Offer event packs.
- **Protect open sign-up from abuse**: verify the email; ask for a card before an event goes live, even a free one.
  Text caps matter only if BoothGen ever sends texts itself (see below).
- **Promote the CRM where it helps**: e.g. when typing a client's name on an event, after an event ("send the invoice
  next time with Genius"), or from the gallery screen. One link in the menu as well. Keep it dismissible.
- **Guest texts and emails**: today operators must connect their own Twilio and Resend (`src/lib/genie/messaging.ts`),
  so BoothGen pays nothing per message and the SMS-cost abuse risk above mostly goes away. But for open sign-up this is
  the biggest setup hurdle: US texting needs A2P 10DLC registration in Twilio (days to weeks), and Resend needs a
  verified domain. Options: (a) keep own accounts, with the QR photo page working without either; (b) BoothGen sends
  email by default (cheap), operators can still connect their own; (c) BoothGen also sends texts, included in the event
  price up to a cap, own Twilio optional. Recommended: (b) at launch, (c) later if operators ask.
- **G's idea: BoothGen email and texting as a paid add-on** (own accounts stay possible). Notes:
  - Email: send from a BoothGen address (e.g. photos@ a BoothGen domain) with the operator's business name as the
    sender name and their email as Reply-To. Cheap enough to include free, or bundle with texting.
  - Texting: BoothGen registers once. A toll-free number with toll-free verification is likely faster than A2P 10DLC
    for a platform sending for many operators. Confirm with Twilio whether each operator must be registered as well
    (ISV rules) before promising "no setup".
  - Opt-outs: on a shared number a guest's STOP applies to every operator using it; BoothGen owns STOP/HELP handling
    and the consent wording on the iPad.
  - Pricing: per event (e.g. up to N texts per event) is simplest with pay per event; count from GenieShare rows and stop
    or warn at the cap. Price above Twilio's per-text cost plus carrier fees.
  - Build: a "BoothGen" provider choice in `GenieMessagingConfig` that uses platform credentials, plus usage counting and
    the cap. Most of the sending, status webhooks and share records already exist.
- **Cost and competitors (web research, 2026-11-14; check before pricing)**:
  - Snappic: about $29 per event or from $69/month; texts and email included, unlimited in US/Canada (fair use).
  - LumaBooth: about $18–20/month; reportedly unlimited US/Canada texts (sources conflict).
  - Our cost: one text ≈ $0.012–0.013 per 160-character segment (Twilio about $0.0083 plus carrier fees), so
    150 texts ≈ $2. Email ≈ $0.001 each. Fixed: toll-free number about $2/month, Resend Pro about $20/month. Stripe
    takes about $1.14 of a $29 charge.
  - So messaging is a small part of the price, and competitors include it. Suggestion: include texts and email in the
    event price with a fair-use cap (e.g. 500 texts), no separate add-on; own Twilio/Resend stays an option. Keep the
    text to one segment (short link, no emoji). Offer a monthly plan as well, for operators with many events.
- **G's pricing idea (2026-11-14)**: Genie only = **$15 per event, up to 2 iPads, BoothGen texts and email included**.
  CRM membership unchanged; **+$10 per event to add Genie** (confirmed by G), same inclusions as Genie only.
  - Per event: cost about $2–4 texts plus about $0.74 Stripe fee, so about $10–12 margin; a 500-text event still
    leaves about $7. Needs a text cap per event and a rule for a 3rd iPad (e.g. +$5).
  - Event packs (e.g. 5 for $70, charged once) cut Stripe's $0.30 per charge and reward regulars.
  - Busy operators (10 events = $150/month) may compare with Snappic $69/month or LumaBooth $19/month; a monthly Genie
    plan can come later if that happens.
  - CRM + Genie at $10 per event: about $6–7 margin on a typical event, about $3 on a 500-text one; same text cap.
    The CRM membership is the discount, so the two prices don't undercut each other.
  - Operators using their own Twilio/Resend: same price (they keep their branding); no discount at first.
- **G's decisions (2026-11-14)**:
  - Text cap: later, after usage data. **Usage analytics built in from launch** (texts, emails, sessions and photos
    per event, per operator; Super Admin view) and **review the cap after at least 20 paid events**. Suggestion: a
    high safety limit from day one, e.g. 2,000 per event, only to stop a bug or abuse.
  - Monthly Genie plan for busy operators: TBD later.
  - **AI features (when Genie gets them) cost extra, paid with credits** (G). Suggestions: prepaid credit packs on the
    account (not per event); each AI generation uses credits by model cost, priced with margin; credits never charged
    for a failed generation; a per-event and per-guest limit the operator sets, so one event can't drain the balance;
    low-balance warning by email; AI calls go through BoothGen (not straight from the iPad) so they're metered and the
    provider keys stay off devices; AI usage in the same per-event analytics. Same for Genie only and Genius.
  - A 3rd or 4th iPad = pay for the event again (each payment covers 2 iPads). Expected to be rare.
  - Event packs: later.
  - Payment can happen any time. Until the event is paid, the booth screen and the photos carry a watermark.
    (Bundle flag, e.g. `watermark: true`; Genie draws it on the booth screen and the output. Genie work.)
  - Team members: **one login per account at launch**; attendants maybe later.
  - Downgrade: when a Genius subscription ends, **all CRM activity stops** (automations, client invoice payment links,
    contracts awaiting signature, quotes). The account and its data are kept, never deleted; the account carries on as
    Genie only ($15 per event) and resubscribing brings the CRM back (confirmed by G). Before the end date, email the
    operator the list of open invoices, unsigned contracts and scheduled automations (confirmed). Afterwards, old client
    invoice and contract links show "This is no longer available; please contact <business name>" (confirmed).
  - Placeholder client: OK, **one "Booth events" client per operator account**. Every event already belongs to an
    operator (`tenantId`), so Super Admin and reports always know whose event it is; the placeholder only fills the
    required client field.
- **Genius per event**: charge per booked event (contract signed or first invoice paid), or a small monthly base plus a
  fee per event, because CRM use starts before any event exists.

## How BoothGen works today (what the plan has to fit)

| Area | Today | Matters because |
|---|---|---|
| Genie access | `Tenant.genieEnabled` (Super Admin switch); Genie pages need `HOST_ADMIN` | Genie only = the same switch, plus "no CRM" |
| Plans | `StripeSubscription.plan`: FREE_TRIAL, MONTHLY, ANNUAL, LIFETIME; `Tenant.status` TRIAL/ACTIVE/…; `trialEndsAt` | A new plan or a flag next to these |
| Pro gate | `hasProAccess()` gates galleries, **including Genie photo uploads** (`/api/genie/events/[id]/upload-url` answers 403 `pro_required`) | A Genie-only account must pass this gate or guests get no photo pages |
| Events | `Event.clientId` is **required**; about 130 places in the code read `event.client` (event pages, quotes, invoices, portal, calendar, emails) | The main design choice: placeholder client or optional client |
| Bundle | `event.clientName` is **optional** in the Genie EventBundle schema | iPads don't need a client |
| Route guard | `src/middleware.ts` has TENANT and TEAM_MEMBER_BLOCKED prefix lists | Blocking CRM routes for Genie only goes here, plus API checks |
| Menu | `Sidebar.tsx`: admin sections plus the Genie section when `genieEnabled` | A Genie-only menu |
| Sign-up | `/sign-up` then `/onboarding` (CRM-oriented: packages, Stripe Connect, etc.) | Needs a Genie path |

## Proposed shape

### 1. Account type
Add `Tenant.product`: `"crm"` (default, everyone today) | `"genie"`. A Genie-only tenant also has `genieEnabled = true`.
- Better than reusing `SubscriptionPlan`. The plan answers "what do they pay"; the product answers "what do they see".
  A Genie-only tenant still has a trial or a paid plan.
- One helper, `isGenieOnly(tenant)`, used by the middleware, the layout, the sidebar and the API guards.

### 2. What they see, and what's blocked
- **Sidebar**: the Genie section (Events, Event Defaults, Props, Backdrops, Devices, Sharing), **Layouts** (the template
  library and designer, which Genie needs), Gallery (read-only view of their event galleries), Settings (a short list:
  profile, branding, Genie messaging, team if allowed, billing), Report a bug.
- **Blocked on the server**, not only hidden: `/dashboard` (send them to `/genie/events`), `/clients`, `/leads`, `/quotes`,
  `/invoices`, `/contracts`, `/automation`, `/calendar`, `/analytics`, `/messages`, and their `/api/*` routes.
  - The middleware gets a GENIE_ONLY_BLOCKED list.
  - API routes for CRM objects also check `isGenieOnly` inside the route, because the middleware only sees the JWT.
    `product` must be added to the JWT and refreshed on upgrade.
- **Pro gate**: `hasProAccess()` returns true for an active or trialing Genie-only plan, so galleries and photo uploads work.

### 3. Creating events without the CRM: placeholder client (recommended) vs optional client

| | **A. Hidden placeholder client** (recommended) | B. Make `Event.clientId` optional |
|---|---|---|
| Schema | Add `Client.isPlaceholder` (one per tenant, created on first Genie event) | `clientId` nullable |
| Code impact | Small: the new "New booth event" form uses it; client lists filter it out | Large: about 130 reads of `event.client` need null handling (pages, PDFs, emails, portal, calendar feed) |
| Risk | Low. The placeholder could leak into a list we forget to filter (e.g. exports) | Medium-high: crashes in CRM screens we don't touch daily |
| Upgrade | Events show the client "Booth events (no client)"; the operator can re-assign a real client per event | Events have no client; same re-assign flow |

The **New booth event** form asks for the name, the date, optional start and end times, the venue and the time zone. Saving
it also sets up Genie for the event from the account's defaults (the same as today's "Set Up Genie").

### 4. Sign-up and billing
- `/sign-up?product=genie` (or a "Genie" page linked from pricing): account, then a short Genie onboarding (business name,
  logo, time zone, pair an iPad), skipping CRM steps such as packages and Stripe Connect.
- Stripe: a Genie price (monthly, maybe annual), set up like the current plan prices (`stripe_price_*` SystemSettings), so
  Super Admin can change it. The trial works as it does today (`trialEndsAt`).
- Super Admin → Operators shows the product and can switch it.

### 5. Upgrade and downgrade
- **Genie → full CRM**: flip `product` to `crm`, switch to the CRM price (Stripe proration). Nothing moves: events, designs,
  props, backdrops, photos, galleries and devices stay. The placeholder client shows as a normal client they can rename,
  or they re-assign events.
- **Full CRM → Genie only**: hide and block the CRM pages, but **never delete** CRM data, so upgrading again brings it all
  back. Open questions:
  - What happens to running automations (pause them?), open invoices and payment links (keep the portal working for
    clients?), and contracts awaiting signature?
  - Recommendation: allow a downgrade only when nothing is outstanding (no unpaid invoices, no unsigned contracts, no
    scheduled automations), or pause them with a clear warning.

### 6. Alternative: stand-alone iPad mode (no account)
Genie runs with no BoothGen account: the operator configures it on the iPad, and it prints only.
- No QR photo page, no SMS or email, no uploads or galleries, no templates from BoothGen (built-in only), no remote setup.
- Almost all of this is Genie (iPad) work; BoothGen is not involved.
- Useful as a free tier or a demo that leads to a Genie-only account. It doesn't replace Genie only.

## Rough size (BoothGen side)

| Piece | Size |
|---|---|
| `Tenant.product`, JWT, `isGenieOnly`, middleware and API guards, Pro gate | M |
| Genie-only sidebar, dashboard redirect, short Settings | S |
| Placeholder client and "New booth event" form | S–M |
| Sign-up and onboarding path, Genie Stripe price and webhook handling | M–L |
| Super Admin product switch, pricing page | S |
| Upgrade (and downgrade, depending on the answers) | S (upgrade) / M (downgrade) |
| Tests: access matrix (every blocked route), upgrade keeps everything | M |

Overall about one to two focused build days, done in stages: guards and menu, then events, then sign-up and billing.
Genie itself needs no change; the bundle is the same.

## Risks
- **Leaks**: a CRM page or API that isn't blocked. Mitigation: one blocked list and a test that walks every `(tenant)` route
  and CRM API as a Genie-only user.
- **JWT staleness** after an upgrade or downgrade: the session keeps the old `product` until it refreshes. Refresh on the
  billing webhook (as `tenantRole` is handled), or read the product from the DB in the layout.
- **The placeholder client** showing up in exports, the calendar or search. Filter it, and test that.
- **Stripe edge cases**: switching products mid-period, and trials converting to the right price.

## Open questions for G
1. **Sign-up**: self sign-up on the website, or invite only (Super Admin creates Genie-only accounts) to start?
2. **Price and trial**: monthly price (and annual?), trial length, and whether the trial needs a card.
3. **Users**: one login only, or can a Genie-only account invite team members (e.g. attendants who see Devices and Events)?
4. **Downgrade** (CRM → Genie only): allowed? Pause or block when invoices, contracts or automations are outstanding?
5. **Clients**: OK with the hidden placeholder client (recommended), or would you rather events have no client at all?
6. **Stand-alone iPad mode**: wanted as a free, prints-only tier, or not for now?
