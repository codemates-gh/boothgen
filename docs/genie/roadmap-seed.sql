-- BoothGen 2.108.0: starting roadmap (Genie's state on 2026-11-18). Run in the Neon SQL Editor on the PRODUCTION
-- branch AFTER apply-production-roadmap.sql. Data only. Safe to run more than once: an item that already exists is
-- left as it is (edits made in Super Admin or with scripts/dev-roadmap.mjs are kept). Nothing is shown to operators.
-- Shipped items have no shipped date or version yet; set them in Super Admin or with dev-roadmap.mjs if wanted.
INSERT INTO "roadmap_items" ("id", "title", "summary", "status", "area", "group", "sortOrder", "planRef", "visibleToOperators", "updatedAt") VALUES
  ('pose-library', 'Pose library', 'Solo (Her, Him, All) or Group pose ideas on the iPad, before Start and during the countdown', 'in_progress', 'genie_ipad', 'next_up', 0, 'docs/plan.md P11', false, NOW()),
  ('sharing-station', 'Sharing station for PC booth software', 'Share photos from PC booth software on the iPad: a watch folder via the print box, only shared photos uploaded, one-click upload of the whole event; paid per-event add-on', 'planned', 'print_box', 'next_up', 1, NULL, false, NOW()),
  ('animated-gif', 'Animated GIF', 'Short looping GIFs from a burst of photos, shared like Boomerangs', 'planned', 'genie_ipad', 'next_up', 2, NULL, false, NOW()),
  ('confession-booth', 'Confession booth (video)', 'Guests record short video messages at the booth', 'planned', 'genie_ipad', 'next_up', 3, NULL, false, NOW()),
  ('ai-photo-booth', 'AI photo booth', 'AI-styled photos from the booth', 'planned', 'genie_ipad', 'next_up', 4, NULL, false, NOW()),
  ('extra-ipads', 'Extra iPads per event', 'Run more than one iPad at an event as a paid add-on', 'planned', 'boothgen', 'essential', 0, NULL, false, NOW()),
  ('duplicate-event', 'Duplicate event', 'Copy an event with its settings to start the next one faster', 'planned', 'boothgen', 'essential', 1, NULL, false, NOW()),
  ('guest-individual-photos', 'Individual photos on the guest download page', 'Option to offer each photo on its own, not only the finished print', 'planned', 'guest_pages', 'essential', 2, NULL, false, NOW()),
  ('guest-reprints', 'Guest reprints', 'Guests ask for another copy of their print', 'planned', 'guest_pages', 'essential', 3, NULL, false, NOW()),
  ('event-analytics', 'Event analytics and guest contact capture', 'Sessions, shares and prints per event, plus guest contact details collected at sharing', 'planned', 'boothgen', 'essential', 4, NULL, false, NOW()),
  ('white-label-guest', 'White-label guest experience', 'Guest pages and messages under the operator''s own brand', 'planned', 'guest_pages', 'essential', 5, NULL, false, NOW()),
  ('start-screen-customization', 'Start-screen customization', 'Operators design the iPad start screen for each event', 'planned', 'genie_ipad', 'essential', 6, NULL, false, NOW()),
  ('review-sharing-timing', 'Review and sharing screen timing', 'Set how long guests stay on the review and sharing screens', 'planned', 'genie_ipad', 'essential', 7, NULL, false, NOW()),
  ('booth-360', '360 booth with video effects', 'A 360 video booth with effects', 'planned', 'genie_ipad', 'later', 0, NULL, false, NOW()),
  ('between-shots-sound', 'Separate between-shots countdown sound', 'Its own countdown sound between shots of a session', 'planned', 'genie_ipad', 'later', 1, NULL, false, NOW()),
  ('raspberry-pi-print-box', 'Raspberry Pi print box', 'A print box that runs on a Raspberry Pi', 'planned', 'print_box', 'later', 2, NULL, false, NOW()),
  ('prints-left', 'Prints left on each printer', 'Show how many prints each printer has left', 'planned', 'print_box', 'later', 3, NULL, false, NOW()),
  ('one-ipad-many-pcs', 'One iPad printing to several booth PCs', 'Send prints from one iPad to more than one booth PC', 'planned', 'print_box', 'later', 4, NULL, false, NOW()),
  ('direct-usb-printing', 'Direct USB printing from the iPad', 'Print straight from the iPad to the printer over USB', 'planned', 'genie_ipad', 'later', 5, 'docs/plan.md P9', false, NOW()),
  ('genie-mascot', 'Genie mascot', 'A Genie character for the booth screens', 'planned', 'genie_ipad', 'later', 6, NULL, false, NOW()),
  ('iphone-accessibility-translations', 'iPhone layout, accessibility and translations', 'Genie on iPhone, better accessibility, and more languages', 'planned', 'genie_ipad', 'later', 7, NULL, false, NOW()),
  ('canon-wifi', 'Canon over Wi-Fi', 'Use a Canon camera over Wi-Fi instead of USB', 'planned', 'genie_ipad', 'later', 8, NULL, false, NOW()),
  ('android-tablet', 'Android tablet version', 'Genie on Android tablets', 'planned', 'genie_ipad', 'later', 9, NULL, false, NOW()),
  ('boomerang-templates', 'Boomerang shapes and templates', 'Square, 3:4, 9:16 and 16:9 Boomerangs inside the event''s templates', 'shipped', 'genie_ipad', 'next_up', 0, 'docs/plan.md P10', false, NOW()),
  ('countdown-sound', 'Countdown sound per event', 'Choose or upload the countdown sound for each event', 'shipped', 'genie_ipad', 'next_up', 1, NULL, false, NOW()),
  ('virtual-backdrops', 'Virtual backdrops', 'Replace the background behind guests', 'shipped', 'genie_ipad', 'next_up', 2, 'docs/plan.md P8', false, NOW()),
  ('virtual-props', 'Virtual props', 'On-screen props guests can wear in their photos', 'shipped', 'genie_ipad', 'next_up', 3, 'docs/plan.md P7', false, NOW()),
  ('canon-usb', 'Canon USB camera', 'Shoot with a Canon camera connected over USB', 'shipped', 'genie_ipad', 'next_up', 4, 'docs/plan.md P0', false, NOW()),
  ('print-box-two-printers', 'Print box with two printers', 'The print box drives two printers at once', 'shipped', 'print_box', 'next_up', 5, 'docs/plan.md P2', false, NOW()),
  ('capture-screen-boomerang', 'Capture screen and Boomerang', 'The new capture screen and Boomerang mode', 'shipped', 'genie_ipad', 'next_up', 6, 'docs/plan.md P6', false, NOW()),
  ('attendant-panel-redesign', 'Attendant panel redesign', 'A clearer attendant panel on the iPad', 'shipped', 'genie_ipad', 'next_up', 7, NULL, false, NOW()),
  ('splash-screen', 'Splash screen', 'A Genie splash screen when the app opens', 'shipped', 'genie_ipad', 'next_up', 8, NULL, false, NOW())
ON CONFLICT ("id") DO NOTHING;

-- Check: counts per status (in_progress 1, planned 22, shipped 9)
SELECT "status", count(*) FROM "roadmap_items" GROUP BY "status" ORDER BY "status";
