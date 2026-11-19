-- BoothGen 2.116.0: Beautify and Glamour Style are separate filters (G, 2026-11-19). Beautify (step "beautify") is a free
-- standard filter again; Glamour Style (step "glamourStyle") is the paid add-on. 2.114.0 marked Glamour Style as free
-- on events that used Beautify; those events were using the free filter, so that mark comes off. No schema change.
-- Run in the Neon SQL Editor on the PRODUCTION branch with (or after) the deploy. Safe to run more than once.

-- 1. First, any Glamour Style payments taken under 2.114.0–2.115.0 (they would have been for Beautify): tell Claude
SELECT id, "tenantId", "eventId", "amountCents", status, "addOns", "paidAt" FROM "genie_event_payments"
WHERE 'glamourStyle' = ANY("addOns");

-- 2. Remove the 2.114.0 "Glamour Style included" mark
UPDATE "event_genie_settings" SET "addOnsIncluded" = array_remove("addOnsIncluded", 'glamourStyle')
WHERE 'glamourStyle' = ANY("addOnsIncluded");

-- Check: should return 0
SELECT count(*) AS still_marked FROM "event_genie_settings" WHERE 'glamourStyle' = ANY("addOnsIncluded");
