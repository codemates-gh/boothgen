-- Genie-only accounts, stage 2b (BoothGen 2.88.0): pay per event.
-- Run in Neon production BEFORE deploying. Safe to run twice.
CREATE TABLE IF NOT EXISTS genie_event_payments (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "ipads" INTEGER NOT NULL DEFAULT 2,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "genie_event_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "genie_event_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "genie_event_payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES events("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "genie_event_payments_stripeCheckoutSessionId_key" ON genie_event_payments("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "genie_event_payments_tenantId_idx" ON genie_event_payments("tenantId");
CREATE INDEX IF NOT EXISTS "genie_event_payments_eventId_idx" ON genie_event_payments("eventId");

-- Check: the table exists and is empty (expect 0)
SELECT count(*) FROM genie_event_payments;
