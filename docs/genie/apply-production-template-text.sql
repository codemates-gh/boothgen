-- BoothGen 2.115.0: template text (client's words drawn on templates).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds three nullable columns; nothing is
-- changed or dropped. Safe to run more than once.
ALTER TABLE "event_genie_templates" ADD COLUMN IF NOT EXISTS "textOptions" JSONB;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "templateText" JSONB;
ALTER TABLE "event_design_briefs" ADD COLUMN IF NOT EXISTS "textAdjust" JSONB;

-- Check: should return three rows (textAdjust, templateText, textOptions)
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE (table_name = 'event_genie_templates' AND column_name = 'textOptions') OR (table_name = 'event_genie_settings' AND column_name = 'templateText')
   OR (table_name = 'event_design_briefs' AND column_name = 'textAdjust') ORDER BY column_name;
