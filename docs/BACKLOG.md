# BoothGen backlog

Ideas agreed on but not scheduled yet. Newest first. When one is picked up, move it to a release and note the version in CHANGELOG.md.

---

## Templates: draw the client's text on the layout

**Status:** not started. **Added:** 2026-11-18.

**Goal:** a template's Text fields, Color palettes and Font pairings (Client Options) show on the template itself, not only as questions in the client's design brief. Today they draw nothing: the designer places only photo frames, a background colour, a background image and an overlay PNG, so the operator makes the artwork elsewhere from the client's answers and uploads it as a proof.

### What it would do
- **Designer:** each Text field gets a box on the canvas (position, size, rotation, alignment), like a photo frame. The box takes its font from the chosen Font pairing and its colour from the chosen palette's Text or Accent colour. The palette's Background colour fills the layout background. Preview shows the sample values ("Geoffrey & Ronnette", "July 10, 2027").
- **Text effects:** each text box can have an **outline (stroke)** and a **drop shadow**, so text stays readable over photos and busy backgrounds. Outline: colour and thickness. Shadow: colour, softness (blur), distance and direction, with simple presets (Soft, Hard, Glow) and a custom setting. Colours default to the palette (e.g. Accent for the outline, black at 40% for the shadow) and follow the client's palette choice. Set by the template maker per box; the client doesn't change them in the brief.
- **Client brief:** when the client fills in the text and picks a palette and fonts, the portal shows the layout with their words in place, live.
- **Genie:** the event's template carries the finished look with no hand-made artwork needed: names, date and colours drawn on every print, Boomerang and (later) GIF.
- Works for every size, including Boomerang & GIF only templates (Square, 9:16, 16:9).

### How (to decide when picked up)
- **Simplest:** BoothGen renders the text layer to a transparent PNG at the layout's full size (server side, with the same fonts) once the brief is answered, and uses it as the template's overlay, combined with any overlay art. No Genie change; the iPad just gets an overlay.
- **Later option:** send text boxes in the bundle and have Genie draw them, so per-guest text (e.g. a guest's name) is possible. Needs a Genie schema change.
- **Fonts (decided):** keep to the curated list the font pairings already use (Playfair Display, Cormorant Garamond, Cinzel, Montserrat, Raleway, Josefin Sans, Lato, Bebas Neue, Great Vibes, Dancing Script, Pacifico, Sacramento). All are Google Fonts under the SIL Open Font License: free for commercial use, printing and embedding. Host the font files with BoothGen (not loaded from Google at render time) so the designer, the portal and the server draw identical text. Grow the list over time; no uploaded fonts at first (most store-bought fonts don't allow this use); maybe later, with a checkbox that the operator holds the licence.

### Decided (2026-11-18)
- **Text too long for its box:** shrink to fit. The client can make it bigger or smaller in the brief if the result is too small.
- **One set of answers per event:** names and date are the same on every layout, so the client fills them in once. Each layout takes the palette and fonts the client chose for their brief layout when it has the same choices, else its own first palette and pairing. The operator can change them per template on the event.
- **Before the client answers:** samples show in the designer and portal previews only. On the iPad, text is left out until answered (never print "Geoffrey & Ronnette" at a real event), and the event's Genie tab warns that the text isn't filled in yet. The operator can type the text there themselves, for events without a client brief.

---

## Bookkeeping (under Insights, beside Analytics)

**Status:** first version shipped in 2.101.0 (ledger filled from BoothGen payments and fees, manual income and expenses with receipts, categories, bulk actions, P&L and Client Sales with CSV). 2.101.1 added refunds (from cancelling with a refund), print costs and event expenses. 2.101.2 added Stripe refunds (dashboard or API) and Record Refund for cash/check/Zelle. 2.101.3 added full-payment invoice refunds to Cancel Event. 2.101.4 added auto-categorize by payee. 2.101.5 added QuickBooks/Xero exports and a Year-End Summary. Still to do: the "Later" list below.

**Added:** 2026-11-17. **Reference:** 17hats Bookkeeping (All Transactions / To Be Categorized / Categorized, New Income, New Expense, Reports, Assign to Project).

**Goal:** a simple income-and-expense ledger for a photo booth business, filled in mostly on its own from BoothGen payments, so an operator can see profit per event and per month and hand clean numbers to their accountant. Not full double-entry accounting.

### Where it lives
- Sidebar → **Insights**: Analytics, **Bookkeeping**.
- Event page → Profitability card links to that event's transactions.

### Transactions
- **Automatic from Stripe:** every client payment (invoice, deposit, milestone) as income, and the Stripe processing fee as a separate expense ("Merchant Fees"), already linked to its invoice, client and event. Refunds come in as negative income.
- **Manual payments:** "Mark Paid" (cash, check, bank transfer) creates the income line too, so all revenue shows in one place.
- **New Income / New Expense** by hand: date, amount, payee or payer, category, notes, optional event, optional receipt.
- **Receipts:** attach a photo or PDF (phone camera friendly). Stored in R2 under the account, same limits approach as galleries.
- **Status tabs:** All Transactions · To Be Categorized (with a count) · Categorized.
- **Bulk actions:** select rows → Categorize, Verify (mark as checked), Delete (manual entries only), **Assign to Event** (17hats' "Assign to Project").
- **Filters:** source (Stripe / manual), category, type (income / expense), date range, amount, keywords.

### Categories
- Default set for photo booth businesses:
  - **Income:** Sales, Add-ons, Travel Fees, Tips, Refunds.
  - **Expenses:** Merchant Fees, Print Media, Props, Equipment, Software, Travel and Mileage, Staff and Attendants, Marketing, Insurance, Rent/Storage.
- Operators can add, rename and hide categories.
- Optional: auto-categorize by payee (remember the last category used for the same payee).
- Print Costs (Settings → Events → Print Costs) and each event's print log can post the event's print media cost as an expense.

### Reports
- Profit & Loss by month, quarter or year (income, expenses by category, net).
- Profit per event (revenue, fees, print costs, other assigned expenses, margin), building on the existing Profitability tab.
- Income by client and expenses by category.
- Export CSV (and PDF) for an accountant; a QuickBooks/Xero-friendly CSV layout.

### Data and rules
- New models: `Transaction` (tenantId, date, amountCents, type, categoryId, source, stripeChargeId / paymentId, invoiceId, eventId, clientId, payee, notes, receiptUrl, verified, createdById), `TransactionCategory` (tenantId, name, type, hidden).
- Stripe transactions are created from the existing Stripe webhook (payment succeeded, charge refunded, balance transaction for the fee) and are idempotent on the Stripe id. Backfill past Stripe payments once when the feature is turned on.
- Stripe-sourced amounts can't be edited, only categorized, split or assigned; manual entries are fully editable.
- Admin only (HOST_ADMIN); team members don't see Bookkeeping.
- Currency follows the account's currency setting.

### Later
- Bank feeds (Plaid) for card and bank expenses.
- ~~Mileage log~~ (shipped in 2.102.0).
- Sales tax summary.
- Year-end summary email.

---

## Gmail / Outlook email sync (client conversations)

**Added:** 2026-11-17. Replies now go to the operator's own inbox (2.99.0). Next steps, only if customers ask:
1. **Logging address ("Smart BCC"):** a personal BoothGen address per account; BCC or forward an email to it and it's filed under the matching client's current event.
2. **Gmail / Outlook sync:** send from the operator's own address and pull client threads onto the event automatically. Gmail's read/send scopes are restricted (annual security assessment, real cost); Microsoft is lighter.

---

## Genie iPad app: larger upload limits

**Added:** 2026-11-17. BoothGen now accepts iPad photos up to 25 MB and boomerang MP4s up to 100 MB (2.100.0; adjustable in Super Admin → Settings → Gallery Uploads). If the iPad app checks file size itself before uploading, update it in the Genie repo so it no longer stops at 15 MB.
