import { z } from 'zod';

// What a client can customize when they pick a layout in their design brief (portal → Design).
// Stored on BoothDesignTemplate (description, textZones, colorVariants, fontPairings).

export const FONT_OPTIONS = [
  { id: 'playfair', label: 'Playfair Display', fontFamily: "'Playfair Display', serif" },
  { id: 'cormorant', label: 'Cormorant Garamond', fontFamily: "'Cormorant Garamond', serif" },
  { id: 'cinzel', label: 'Cinzel', fontFamily: "'Cinzel', serif" },
  { id: 'montserrat', label: 'Montserrat', fontFamily: "'Montserrat', sans-serif" },
  { id: 'raleway', label: 'Raleway', fontFamily: "'Raleway', sans-serif" },
  { id: 'josefin', label: 'Josefin Sans', fontFamily: "'Josefin Sans', sans-serif" },
  { id: 'lato', label: 'Lato', fontFamily: "'Lato', sans-serif" },
  { id: 'bebas', label: 'Bebas Neue', fontFamily: "'Bebas Neue', cursive" },
  { id: 'great-vibes', label: 'Great Vibes', fontFamily: "'Great Vibes', cursive" },
  { id: 'dancing', label: 'Dancing Script', fontFamily: "'Dancing Script', cursive" },
  { id: 'pacifico', label: 'Pacifico', fontFamily: "'Pacifico', cursive" },
  { id: 'sacramento', label: 'Sacramento', fontFamily: "'Sacramento', cursive" },
] as const;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colors are hex values like #D4AF37');
const id = z.string().min(1).max(64);

export const TextZone = z.object({
  id,
  label: z.string().trim().min(1, 'Every text field needs a label').max(60),
  placeholder: z.string().max(120).default(''),
  maxChars: z.number().int().min(1).max(500),
  required: z.boolean(),
  hint: z.string().max(200).optional(),
}).strict();

export const ColorVariant = z.object({
  id,
  name: z.string().trim().min(1, 'Every color palette needs a name').max(60),
  colors: z.object({ background: hex, text: hex, accent: hex }).strict(),
}).strict();

export const FontPairing = z.object({
  id,
  name: z.string().trim().min(1, 'Every font pairing needs a name').max(60),
  fonts: z.array(z.object({ zoneId: id, fontId: z.string(), label: z.string().max(60), fontFamily: z.string().max(120) }).strict()).max(20),
}).strict();

export const ClientOptions = z.object({
  description: z.string().trim().max(300).nullable().optional(),
  textZones: z.array(TextZone).max(10).optional(),
  colorVariants: z.array(ColorVariant).max(12).optional(),
  fontPairings: z.array(FontPairing).max(12).optional(),
});

export type TextZone = z.infer<typeof TextZone>;
export type ColorVariant = z.infer<typeof ColorVariant>;
export type FontPairing = z.infer<typeof FontPairing>;

// Font pairings follow the text fields: unknown fonts and removed fields are dropped, new fields get a default font
export function syncPairings(pairings: FontPairing[], zones: TextZone[]): FontPairing[] {
  return pairings.map(p => ({
    ...p,
    fonts: zones.map(z => {
      const f = p.fonts.find(x => x.zoneId === z.id);
      const font = FONT_OPTIONS.find(o => o.id === f?.fontId) ?? FONT_OPTIONS.find(o => o.id === 'montserrat')!;
      return { zoneId: z.id, fontId: font.id, label: z.label, fontFamily: font.fontFamily };
    }),
  }));
}
