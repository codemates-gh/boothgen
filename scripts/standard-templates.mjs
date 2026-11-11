#!/usr/bin/env node
// BoothGen's Standard layout templates (Super Admin → Design Templates), grouped by size.
//
//   node scripts/standard-templates.mjs --local   add/refresh them in the local database (localhost only)
//   node scripts/standard-templates.mjs --sql     print SQL for production (Neon SQL Editor)
//
// Ids are fixed so re-running updates the same rows. Sizes: 4×6 landscape 1800×1200, 4×6 portrait 1200×1800,
// 2×6 strip 600×1800 (300 dpi). Photo frames keep 60 px (strips 45 px) from the edges, outside the 1/8" safe line,
// except full-bleed layouts.

const SIZE = {
  L: { format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200 },
  P: { format: '4x6', orientation: 'portrait', widthPx: 1200, heightPx: 1800 },
  S: { format: '2x6', orientation: 'portrait', widthPx: 600, heightPx: 1800 },
};

// [x, y, width, height] per photo, in photo order
const DEFS = [
  // 4×6 landscape
  { id: 'std_l_full_bleed', size: 'L', name: 'Full Bleed Landscape', description: 'One photo edge to edge. Text and logo go over the photo.', frames: [[0, 0, 1800, 1200]] },
  { id: 'std_l_classic', size: 'L', name: 'Classic Single Landscape', description: 'One large photo with a white border.', frames: [[60, 60, 1680, 1080]] },
  { id: 'std_l_logo_panel', size: 'L', name: 'Single + Logo Panel', description: 'One 4:3 photo with a side panel for your names, date or logo.', frames: [[60, 60, 1440, 1080]] },
  { id: 'std_l_side_by_side', size: 'L', name: 'Side by Side', description: 'Two tall photos next to each other.', frames: [[60, 60, 810, 1080], [930, 60, 810, 1080]] },
  { id: 'std_l_three_row', size: 'L', name: 'Three in a Row', description: 'Three tall photos in a row with room for text below.', frames: [[60, 60, 520, 693], [640, 60, 520, 693], [1220, 60, 520, 693]] },
  { id: 'std_l_trio_logo', size: 'L', name: 'Trio + Logo Landscape', description: 'Three photos in a grid; the fourth square holds your text or logo.', frames: [[190, 60, 680, 510], [930, 60, 680, 510], [190, 630, 680, 510]] },
  { id: 'std_l_grid4', size: 'L', name: 'Grid of Four Landscape', description: 'Four photos in a 2×2 grid.', frames: [[190, 60, 680, 510], [930, 60, 680, 510], [190, 630, 680, 510], [930, 630, 680, 510]] },
  // 4×6 portrait
  { id: 'std_p_full_bleed', size: 'P', name: 'Full Bleed Portrait', description: 'One tall photo edge to edge. Text and logo go over the photo.', frames: [[0, 0, 1200, 1800]] },
  { id: 'std_p_classic', size: 'P', name: 'Classic Single Portrait', description: 'One tall photo with room for text below.', frames: [[60, 60, 1080, 1440]] },
  { id: 'std_p_instant', size: 'P', name: 'Instant Camera', description: 'A square photo with a deep bottom border, like an instant print.', frames: [[60, 60, 1080, 1080]] },
  { id: 'std_p_trio_logo', size: 'P', name: 'Trio + Logo Portrait', description: 'Three tall photos in a grid; the fourth square holds your text or logo.', frames: [[60, 60, 510, 680], [630, 60, 510, 680], [60, 800, 510, 680]] },
  { id: 'std_p_grid4', size: 'P', name: 'Grid of Four Portrait', description: 'Four tall photos in a 2×2 grid with room for text below.', frames: [[60, 60, 510, 680], [630, 60, 510, 680], [60, 800, 510, 680], [630, 800, 510, 680]] },
  // 2×6 strips
  { id: 'std_s_three', size: 'S', name: 'Classic Strip of 3', description: 'Three photos down the strip, text or logo at the bottom.', frames: [[45, 45, 510, 383], [45, 473, 510, 383], [45, 901, 510, 383]] },
  { id: 'std_s_three_top', size: 'S', name: 'Strip of 3, Logo on Top', description: 'Text or logo at the top, three photos below.', frames: [[45, 516, 510, 383], [45, 944, 510, 383], [45, 1372, 510, 383]] },
  { id: 'std_s_four', size: 'S', name: 'Classic Strip of 4', description: 'Four photos down the strip.', frames: [[45, 45, 510, 383], [45, 473, 510, 383], [45, 901, 510, 383], [45, 1329, 510, 383]] },
];

// What clients customize in their design brief (same on every Standard layout)
const TEXT_ZONES = [
  { id: 'names', label: 'Names or title', placeholder: 'Ana & Ben', maxChars: 40, required: true },
  { id: 'date', label: 'Date or tagline', placeholder: 'June 14, 2027', maxChars: 40, required: false },
];
const COLOR_VARIANTS = [
  { id: 'classic', name: 'Classic White', colors: { background: '#FFFFFF', text: '#1F1F3D', accent: '#B8935A' } },
  { id: 'midnight', name: 'Midnight', colors: { background: '#14142B', text: '#FFFFFF', accent: '#D4AF37' } },
  { id: 'blush', name: 'Blush', colors: { background: '#F8E8E6', text: '#5A3A3A', accent: '#C97B84' } },
  { id: 'sage', name: 'Sage', colors: { background: '#EEF2EA', text: '#2F3E2F', accent: '#7D9A72' } },
];
const FONT = {
  'great-vibes': "'Great Vibes', cursive", cormorant: "'Cormorant Garamond', serif", montserrat: "'Montserrat', sans-serif",
  lato: "'Lato', sans-serif", bebas: "'Bebas Neue', cursive", raleway: "'Raleway', sans-serif",
};
const pairing = (id, name, a, b) => ({
  id, name,
  fonts: [
    { zoneId: 'names', fontId: a, label: TEXT_ZONES[0].label, fontFamily: FONT[a] },
    { zoneId: 'date', fontId: b, label: TEXT_ZONES[1].label, fontFamily: FONT[b] },
  ],
});
const FONT_PAIRINGS = [pairing('elegant', 'Elegant Script', 'great-vibes', 'cormorant'), pairing('modern', 'Clean Modern', 'montserrat', 'lato'), pairing('bold', 'Bold Party', 'bebas', 'raleway')];

export const STANDARD_TEMPLATES = DEFS.map((d, i) => {
  const size = SIZE[d.size];
  return {
    id: d.id, name: d.name, description: d.description, sortOrder: (i + 1) * 10,
    format: size.format, orientation: size.orientation, photoCount: d.frames.length,
    layout: {
      ...size, dpi: 300, backgroundColor: '#FFFFFF',
      slots: d.frames.map(([x, y, width, height], shotIndex) => ({ id: `f${shotIndex + 1}`, shotIndex, x, y, width, height, rotationDegrees: 0, fit: 'fill' })),
    },
    textZones: TEXT_ZONES, colorVariants: COLOR_VARIANTS, fontPairings: FONT_PAIRINGS,
  };
});

const q = v => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const j = v => `${q(JSON.stringify(v))}::jsonb`;

export function standardTemplatesSql() {
  const ids = STANDARD_TEMPLATES.map(t => q(t.id)).join(', ');
  const rows = STANDARD_TEMPLATES.map(t => `  (${[q(t.id), 'NULL', q(t.name), q(t.description), q(t.format), q(t.orientation), t.photoCount, j(t.textZones), j(t.colorVariants), j(t.fontPairings), j(t.layout), 'true', 'true', t.sortOrder, 'NOW()'].join(', ')})`).join(',\n');
  return `-- Standard layouts: BoothGen's own set. Re-running updates them in place.
-- Earlier test Standard templates are hidden (isActive = false), not deleted.
UPDATE "booth_design_templates" SET "isActive" = false, "isPublished" = false, "updatedAt" = NOW()
  WHERE "tenantId" IS NULL AND "id" NOT IN (${ids});

INSERT INTO "booth_design_templates" ("id", "tenantId", "name", "description", "format", "orientation", "photoCount", "textZones", "colorVariants", "fontPairings", "layout", "isPublished", "isActive", "sortOrder", "updatedAt") VALUES
${rows}
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "format" = EXCLUDED."format", "orientation" = EXCLUDED."orientation",
  "photoCount" = EXCLUDED."photoCount", "textZones" = EXCLUDED."textZones", "colorVariants" = EXCLUDED."colorVariants",
  "fontPairings" = EXCLUDED."fontPairings", "layout" = EXCLUDED."layout", "isPublished" = true, "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = NOW();
`;
}

async function seedLocal() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error('Refusing: DATABASE_URL is not a local database.'); process.exit(1); }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    // One statement per call
    for (const stmt of standardTemplatesSql().split(/;\n/).map(x => x.replace(/^--.*$/gm, '').trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
  } finally { await prisma.$disconnect(); }
  console.log(`Standard templates ready: ${STANDARD_TEMPLATES.length}`);
}

const arg = process.argv[2];
if (arg === '--sql') process.stdout.write(standardTemplatesSql());
else if (arg === '--local') await seedLocal();
