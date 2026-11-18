-- BoothGen 2.105.2: Standard Boomerang designs at Square 1:1, matching the single-photo Design Templates
-- (Full Bleed, Classic Single, Instant Camera). Run in the Neon SQL Editor on the PRODUCTION branch.
-- Data only (no schema change); adds three Standard designs, switched on. Safe to run more than once: a design
-- that already exists is left as it is (so edits made in Super Admin are kept).
INSERT INTO "genie_clip_designs" ("id", "tenantId", "name", "format", "backgroundColor", "slot", "source", "version", "isActive", "sortOrder", "updatedAt") VALUES
  ('std_bm_square_full_bleed', NULL, 'Full Bleed Square', 'square', '#FFFFFF',
   '{"id":"photo","shotIndex":0,"x":0,"y":0,"width":1080,"height":1080,"rotationDegrees":0,"fit":"fill"}', 'designer', 1, true, 10, NOW()),
  ('std_bm_square_classic', NULL, 'Classic Single Square', 'square', '#FFFFFF',
   '{"id":"photo","shotIndex":0,"x":54,"y":54,"width":972,"height":972,"rotationDegrees":0,"fit":"fill"}', 'designer', 1, true, 20, NOW()),
  ('std_bm_square_instant', NULL, 'Instant Camera Square', 'square', '#FFFFFF',
   '{"id":"photo","shotIndex":0,"x":110,"y":60,"width":860,"height":860,"rotationDegrees":0,"fit":"fill"}', 'designer', 1, true, 30, NOW())
ON CONFLICT ("id") DO NOTHING;

-- Check: should list the three designs
SELECT "id", "name", "format", "isActive" FROM "genie_clip_designs" WHERE "id" LIKE 'std_bm_square_%' ORDER BY "sortOrder";
