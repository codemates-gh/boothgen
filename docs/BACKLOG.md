# BoothGen backlog

Ideas agreed on but not scheduled yet. Newest first. When one is picked up, move it to a release and note the version in CHANGELOG.md.

---

## Bookkeeping (under Insights, beside Analytics)

**Status:** first version shipped in 2.101.0 (ledger filled from BoothGen payments and fees, manual income and expenses with receipts, categories, bulk actions, P&L and Client Sales with CSV). 2.101.1 added refunds (from cancelling with a refund), print costs and event expenses. 2.101.2 added Stripe refunds (dashboard or API) and Record Refund for cash/check/Zelle. 2.101.3 added full-payment invoice refunds to Cancel Event. Still to do: auto-categorize by payee, a QuickBooks/Xero CSV layout, and the "Later" list below.

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
- Mileage log (per event, using venue address) with the standard rate.
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
