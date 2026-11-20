-- Which docs/genie SQL files have been run on this database? Read-only: changes nothing.
-- Run in the Neon SQL Editor on the PRODUCTION branch. One row per file: applied / NOT RUN / PARTIAL.
WITH expected(sql_file, tbl, col) AS (VALUES
  ('apply-production-addon-waivers.sql',       'tenants',              'addOnWaivers'),
  ('apply-production-print-copies.sql',        'genie_defaults',       'printCopiesMatchPeople'),
  ('apply-production-print-copies.sql',        'event_genie_settings', 'printCopiesMatchPeople'),
  ('apply-production-gallery-defaults.sql',    'genie_defaults',       'sharingUploadAll'),
  ('apply-production-gallery-defaults.sql',    'genie_defaults',       'galleryAutoPublish'),
  ('apply-production-gallery-defaults.sql',    'event_genie_settings', 'galleryAutoPublish'),
  ('apply-production-gallery-defaults.sql',    'event_genie_settings', 'galleryAutoPublishedAt'),
  ('apply-production-gallery-defaults.sql',    'event_genie_settings', 'customGallery'),
  ('apply-production-start-screen-logo.sql',   'genie_defaults',       'startScreenGenieLogo'),
  ('apply-production-start-screen-logo.sql',   'event_genie_settings', 'startScreenGenieLogo'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiEnabled'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiMode'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiThemeIds'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiFixedThemeId'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiConsentText'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiWaitSeconds'),
  ('apply-production-geniefied.sql',           'event_genie_settings', 'aiReadyText'),
  ('apply-production-geniefied.sql',           'genie_event_payments', 'aiRenders'),
  ('apply-production-geniefied.sql',           'genie_shares',         'kind'),
  ('apply-production-geniefied.sql',           'genie_ai_themes',      'prompt'),
  ('apply-production-geniefied.sql',           'genie_ai_renders',     'inputKey'),
  ('apply-production-template-text.sql',       'event_genie_templates','textOptions'),
  ('apply-production-template-text.sql',       'event_genie_settings', 'templateText'),
  ('apply-production-template-text.sql',       'event_design_briefs',  'textAdjust'),
  ('apply-production-session-delete.sql',      'genie_sessions',       'deletedAt')
)
SELECT e.sql_file,
       CASE WHEN count(c.column_name) = count(*) THEN 'applied'
            WHEN count(c.column_name) = 0 THEN 'NOT RUN'
            ELSE 'PARTIAL' END AS status,
       count(c.column_name) || ' of ' || count(*) AS columns_found
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.tbl AND c.column_name = e.col
GROUP BY e.sql_file
UNION ALL
-- fix-production-early-completed-events.sql: 0 means nothing left to put back (run it, or nothing needed it)
SELECT 'fix-production-early-completed-events.sql',
       CASE WHEN count(*) = 0 THEN 'nothing to fix' ELSE count(*) || ' event(s) still to put back' END,
       ''
FROM events
WHERE status = 'COMPLETED' AND ("eventDate" >= now() - interval '36 hours' OR "endTime" > now())
ORDER BY 1;
