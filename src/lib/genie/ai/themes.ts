import { createHash, randomUUID } from 'crypto';
import { Prisma, type GenieAiTheme } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, getR2Object, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl, type RemoteAsset } from '../templateAssets';
import { readImageInfo } from '../image';
import { placeholderJpeg, toJpeg } from './image';

// Geniefied themes (Genie P13): Standard (Super Admin → AI themes) and My themes (Genie → Themes). The prompt stays in
// BoothGen; the bundle gets AiThemeAsset (id, name, source, sample, thumbnail). Samples are JPEGs ≤ 1200 px with a
// 360 px thumbnail, stored content-addressed like pose pictures; until a real one is made, a placeholder (ensurePlaceholders).

export const THEME_SAMPLE_SIDE = 1200;
export const THEME_THUMB_SIDE = 360;
export const THEME_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
export const THEME_SOURCE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export const THEME_PROMPT_MAX = 2000;

export type ThemeScope = 'standard' | 'mine';
export const themePrefix = (scope: ThemeScope, tenantId: string | null) => {
  if (scope === 'mine' && !tenantId) throw new Error('My themes need an account');
  return scope === 'standard' ? 'genie-ai-themes/standard/' : `genie-ai-themes/${tenantId}/`;
};
export const themeUploadPrefix = (scope: ThemeScope, tenantId: string | null) => themePrefix(scope, tenantId) + 'uploads/';

export function newThemeUploadKey(scope: ThemeScope, tenantId: string | null, contentType: keyof typeof THEME_SOURCE_TYPES) {
  return themeUploadPrefix(scope, tenantId) + randomUUID() + '.' + THEME_SOURCE_TYPES[contentType];
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export async function storeJpeg(prefix: string, body: Buffer): Promise<RemoteAsset> {
  const sha256 = sha(body);
  const key = prefix + sha256 + '.jpg';
  if (!(await headR2Object(key))) await uploadToR2(key, body, 'image/jpeg');
  return { url: r2PublicUrl(key), sha256, contentType: 'image/jpeg', bytes: body.length };
}

// A sample (and its thumbnail) from an image already in memory (an upload, or a "Try it" result)
export async function sampleFrom(body: Buffer, scope: ThemeScope, tenantId: string | null): Promise<{ sample: RemoteAsset; thumbnail: RemoteAsset } | { error: string }> {
  const big = await toJpeg(body, THEME_SAMPLE_SIDE);
  const small = big && await toJpeg(big.body, THEME_THUMB_SIDE, 5);
  if (!big || !small) return { error: "That image couldn't be converted. Try a different file." };
  const prefix = themePrefix(scope, tenantId);
  return { sample: await storeJpeg(prefix, big.body), thumbnail: await storeJpeg(prefix + 'thumbs/', small.body) };
}

// An uploaded picture (JPEG/PNG under .../uploads/), read and removed from storage
export async function takeUpload(url: string, scope: ThemeScope, tenantId: string | null): Promise<Buffer | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(themeUploadPrefix(scope, tenantId))) return { error: "That upload isn't in your account's storage." };
  try {
    const obj = await getR2Object(key);
    if (!obj) return { error: "The upload hasn't finished. Try again." };
    if (obj.body.length > THEME_SOURCE_MAX_BYTES) return { error: 'Pictures must be 15 MB or smaller.' };
    if (!readImageInfo(obj.body)) return { error: "That image couldn't be read. Use a JPG or PNG." };
    return obj.body;
  } finally {
    await deleteFromR2(key).catch(err => console.error('[ai-theme] upload cleanup failed', key, err));
  }
}

// AiThemeAsset (the bundle shape); null while the theme has no sample (not offered to guests)
export function themeAsset(t: GenieAiTheme) {
  if (!t.sample) return null;
  return {
    id: t.id,
    name: t.name.slice(0, 60),
    source: t.tenantId ? 'account' as const : 'standard' as const,
    sample: t.sample as RemoteAsset,
    ...(t.thumbnail ? { thumbnail: t.thumbnail as RemoteAsset } : {}),
  };
}

// Placeholder samples (a gradient card) for themes that don't have one yet, so they're offered to guests before a real
// sample is made; a real sample (upload or "Try it") replaces it. Stored under …/placeholders/.
export const isPlaceholder = (a: RemoteAsset | null | undefined) => !!a?.url.includes('/placeholders/');
export async function ensurePlaceholders(themes: GenieAiTheme[]): Promise<GenieAiTheme[]> {
  const out: GenieAiTheme[] = [];
  for (const t of themes) {
    if (t.sample) { out.push(t); continue; }
    const body = await placeholderJpeg(t.id);
    if (!body) { out.push(t); continue; }
    const prefix = themePrefix(t.tenantId ? 'mine' : 'standard', t.tenantId) + 'placeholders/';
    const small = await toJpeg(body, THEME_THUMB_SIDE, 5);
    const sample = await storeJpeg(prefix, body);
    const thumbnail = small ? await storeJpeg(prefix + 'thumbs/', small.body) : sample;
    // Only if it still has none (a real sample saved meanwhile wins)
    await prisma.genieAiTheme.updateMany({ where: { id: t.id, sample: { equals: Prisma.DbNull } }, data: { sample, thumbnail } });
    out.push((await prisma.genieAiTheme.findUnique({ where: { id: t.id } })) ?? t);
  }
  return out;
}

// For the owner (My themes) and Super Admin: the prompt too. Operators see Standard themes without their prompt.
export function themeView(t: GenieAiTheme, withPrompt: boolean) {
  return {
    id: t.id, name: t.name, source: t.tenantId ? 'account' as const : 'standard' as const,
    ...(withPrompt ? { prompt: t.prompt, fastModel: t.fastModel, qualityModel: t.qualityModel } : {}),
    sample: (t.sample as RemoteAsset | null) ?? null, thumbnail: (t.thumbnail as RemoteAsset | null) ?? null,
    placeholder: isPlaceholder(t.sample as RemoteAsset | null),
    isActive: t.isActive,
  };
}
export type ThemeView = ReturnType<typeof themeView>;

const themeOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

// What an operator can choose from: Standard themes switched on, plus My themes
export async function libraryThemes(tenantId: string) {
  return prisma.genieAiTheme.findMany({ where: { OR: [{ tenantId: null, isActive: true }, { tenantId }] }, orderBy: themeOrder });
}

export function storedThemeIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// The event's themes in its order: ones it may use (Standard on, or its account's own), with a placeholder sample
// made for any that has none
export async function eventThemes(ids: unknown, tenantId: string): Promise<GenieAiTheme[]> {
  const list = storedThemeIds(ids);
  if (!list.length) return [];
  const rows = await ensurePlaceholders(await prisma.genieAiTheme.findMany({ where: { id: { in: list }, OR: [{ tenantId: null, isActive: true }, { tenantId }] } }));
  return list.map(id => rows.find(r => r.id === id)).filter((t): t is GenieAiTheme => !!t && !!t.sample);
}

// Events that list a theme
export async function eventsUsingTheme(id: string): Promise<number> {
  const json = JSON.stringify([id]);
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM event_genie_settings WHERE "aiThemeIds" @> ${json}::jsonb OR "aiFixedThemeId" = ${id}`;
  return Number(n);
}

// Deleting a theme takes it off events (a fixed theme that goes falls back to the guests' choice)
export async function removeThemeEverywhere(id: string) {
  const json = JSON.stringify([id]);
  const rows = await prisma.$queryRaw<{ id: string; aiThemeIds: unknown; aiFixedThemeId: string | null; aiMode: string }[]>`SELECT id, "aiThemeIds", "aiFixedThemeId", "aiMode" FROM event_genie_settings WHERE "aiThemeIds" @> ${json}::jsonb OR "aiFixedThemeId" = ${id}`;
  for (const r of rows) {
    const fixedGone = r.aiFixedThemeId === id;
    await prisma.eventGenieSettings.update({
      where: { id: r.id },
      data: { aiThemeIds: storedThemeIds(r.aiThemeIds).filter(x => x !== id), ...(fixedGone ? { aiFixedThemeId: null, ...(r.aiMode === 'fixedTheme' ? { aiMode: 'beforeStart' } : {}) } : {}) },
    });
  }
}

// Sample files no theme uses any more are deleted (themes share content-addressed files)
export async function deleteUnusedThemeFiles(t: Pick<GenieAiTheme, 'sample' | 'thumbnail'>): Promise<void> {
  for (const a of [t.sample, t.thumbnail] as (RemoteAsset | null)[]) {
    const key = a?.url ? keyForUrl(a.url) : null;
    if (!key || !key.startsWith('genie-ai-themes/')) continue;
    const pattern = '%' + key.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM genie_ai_themes WHERE sample::text LIKE ${pattern} OR thumbnail::text LIKE ${pattern}`;
    if (Number(n) > 0) continue;
    await deleteFromR2(key).catch(err => console.error('[ai-theme] file cleanup failed', key, err));
  }
}

// The 12 Standard themes G asked for (P13 checklist item 7); prompts for G to review. Seeded without samples.
export const STARTER_THEMES: { id: string; name: string; prompt: string }[] = [
  { id: 'std-oil-painting', name: 'Oil painting', prompt: 'Turn it into a classical oil painting on canvas: rich colors, visible brush strokes, soft gallery lighting, a dark painterly background.' },
  { id: 'std-3d-animated', name: '3D animated', prompt: 'Turn it into a frame from a modern 3D animated family film: friendly stylized characters, big expressive eyes, soft studio lighting, a colorful simple background.' },
  { id: 'std-anime', name: 'Anime', prompt: 'Turn it into a hand-drawn anime illustration: clean line art, cel shading, bright colors, a soft sky background.' },
  { id: 'std-comic-book', name: 'Comic book', prompt: 'Turn it into a classic comic book panel: bold ink outlines, halftone dots, flat bright colors, a dynamic action background. No speech bubbles or text.' },
  { id: 'std-renaissance', name: 'Renaissance portrait', prompt: 'Turn it into an Italian Renaissance portrait: period clothing in rich fabrics, soft sfumato light, a landscape seen through an arch behind them.' },
  { id: 'std-superhero', name: 'Superhero', prompt: 'Turn everyone into original superheroes with their own colorful costumes and capes (no existing characters or logos), standing heroically over a city skyline at sunset.' },
  { id: 'std-red-carpet', name: 'Red carpet', prompt: 'Put them on a glamorous red carpet premiere: elegant evening wear, camera flashes, velvet ropes and a blurred crowd behind them.' },
  { id: 'std-gatsby', name: '1920s Gatsby', prompt: 'Turn it into a 1920s Gatsby party: art deco ballroom, flapper dresses, pearls and tuxedos, warm golden light, a sepia-gold film look.' },
  { id: 'std-cyberpunk', name: 'Cyberpunk', prompt: 'Turn it into a cyberpunk scene: neon-lit rainy city street at night, futuristic jackets with glowing accents, pink and teal reflections.' },
  { id: 'std-fairy-tale', name: 'Fairy tale', prompt: 'Turn it into a storybook fairy tale illustration: enchanted forest with a castle in the distance, royal and magical costumes, soft watercolor-like light.' },
  { id: 'std-watercolor', name: 'Watercolor', prompt: 'Turn it into a loose watercolor painting on textured paper: soft washes, gentle color bleeds, a light airy background.' },
  { id: 'std-vintage-film', name: 'Vintage film', prompt: 'Turn it into a vintage 1970s film photograph: warm faded colors, soft grain, slight light leaks, retro clothing and hairstyles.' },
];
