-- BoothGen 2.123.1 follow-up: put back events the old nightly job marked COMPLETED while they weren't over yet.
-- The old job (1 AM UTC = evening in the Americas) completed events dated "yesterday" in UTC, i.e. tonight's US events.
-- The new rule only completes events dated more than 36 hours ago whose end time has passed; anything COMPLETED that
-- fails that rule is set back to BOOKED. The new job completes it properly once it's really over.
-- Run in the Neon SQL Editor on the PRODUCTION branch. Step 1 only reads; run step 2 once the list looks right.

-- 1. Preview: the events that will go back to BOOKED (an event someone completed by hand today would show here too)
SELECT e.id, e.title, e."eventDate", e."endTime", t.name AS account
FROM events e JOIN tenants t ON t.id = e."tenantId"
WHERE e.status = 'COMPLETED'
  AND (e."eventDate" >= now() - interval '36 hours' OR e."endTime" > now())
ORDER BY e."eventDate";

-- 2. Fix
UPDATE events SET status = 'BOOKED', "updatedAt" = now()
WHERE status = 'COMPLETED'
  AND ("eventDate" >= now() - interval '36 hours' OR "endTime" > now());
