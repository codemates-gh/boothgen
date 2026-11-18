-- BoothGen 2.106.0: two Standard Square templates (Boomerang & GIF only): Square Full Frame and Square with Border.
-- Run in the Neon SQL Editor on the PRODUCTION branch. Data only (no schema change). Safe to run more than once: a
-- template that already exists is left as it is (edits made in Super Admin → Design Templates are kept).
INSERT INTO "booth_design_templates" ("id", "tenantId", "name", "description", "format", "orientation", "photoCount", "layout", "isPublished", "isActive", "sortOrder", "updatedAt") VALUES
  ('std_sq_full_frame', NULL, 'Square Full Frame', 'One square photo edge to edge. For Boomerang and GIF.', 'square', 'portrait', 1,
   '{"format":"square","orientation":"portrait","widthPx":1080,"heightPx":1080,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":0,"y":0,"width":1080,"height":1080,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 200, NOW()),
  ('std_sq_border', NULL, 'Square with Border', 'One square photo with a white border. For Boomerang and GIF.', 'square', 'portrait', 1,
   '{"format":"square","orientation":"portrait","widthPx":1080,"heightPx":1080,"dpi":300,"backgroundColor":"#FFFFFF","slots":[{"id":"photo","shotIndex":0,"x":54,"y":54,"width":972,"height":972,"rotationDegrees":0,"fit":"fill"}]}',
   true, true, 210, NOW())
ON CONFLICT ("id") DO NOTHING;

-- Check: should list the two templates
SELECT "id", "name", "format", "isPublished" FROM "booth_design_templates" WHERE "id" IN ('std_sq_full_frame', 'std_sq_border') ORDER BY "sortOrder";
