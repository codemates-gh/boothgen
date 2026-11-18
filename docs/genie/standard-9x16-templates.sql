-- BoothGen 2.106.1: four Standard 9:16 / 16:9 templates (Boomerang & GIF only): Full Frame and with Border, each way.
-- Run in the Neon SQL Editor on the PRODUCTION branch. Data only (no schema change). Safe to run more than once: a
-- template that already exists is left as it is (edits made in Super Admin → Design Templates are kept).
INSERT INTO "booth_design_templates" ("id", "tenantId", "name", "description", "format", "orientation", "photoCount", "layout", "isPublished", "isActive", "sortOrder", "updatedAt") VALUES
  ('std_916_full_frame', NULL, '9:16 Full Frame', 'One tall photo edge to edge, story-shaped. For Boomerang and GIF.', '9x16', 'portrait', 1,
   '{"format":"9x16","orientation":"portrait","widthPx":1080,"heightPx":1920,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":0,"y":0,"width":1080,"height":1920,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 220, NOW()),
  ('std_916_border', NULL, '9:16 with Border', 'One tall photo with a white border, story-shaped. For Boomerang and GIF.', '9x16', 'portrait', 1,
   '{"format":"9x16","orientation":"portrait","widthPx":1080,"heightPx":1920,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":54,"y":54,"width":972,"height":1812,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 230, NOW()),
  ('std_169_full_frame', NULL, '16:9 Full Frame', 'One wide photo edge to edge, screen-shaped. For Boomerang and GIF.', '9x16', 'landscape', 1,
   '{"format":"9x16","orientation":"landscape","widthPx":1920,"heightPx":1080,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":0,"y":0,"width":1920,"height":1080,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 240, NOW()),
  ('std_169_border', NULL, '16:9 with Border', 'One wide photo with a white border, screen-shaped. For Boomerang and GIF.', '9x16', 'landscape', 1,
   '{"format":"9x16","orientation":"landscape","widthPx":1920,"heightPx":1080,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":54,"y":54,"width":1812,"height":972,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 250, NOW())
ON CONFLICT ("id") DO NOTHING;

-- Check: should list the four templates
SELECT "id", "name", "format", "orientation", "isPublished" FROM "booth_design_templates" WHERE "id" IN ('std_916_full_frame', 'std_916_border', 'std_169_full_frame', 'std_169_border') ORDER BY "sortOrder";
