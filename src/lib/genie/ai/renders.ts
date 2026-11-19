import { Prisma, type GenieAiRender } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, getPresignedDownloadUrl, getR2Object, uploadToR2 } from '@/lib/storage/r2';
import { addOnWaivers } from '../addOns';
import { PROMPT_PREAMBLE, aiSettings, type AiSettings } from './settings';
import { toJpeg } from './image';
import { renderWithGoogle } from './provider';

// Geniefied renders (Genie P13): the allowance, the atomic "start a render" step, the render itself and the status
// the iPad polls (AiRenderStatus). Each photo rendered is one render; blocked and failed renders give it back.

export const AI_INPUT_MAX_SIDE = 2048;

export type Allowance = { covered: boolean; total: number; used: number; left: number };

// Is the Geniefied add-on paid (or waived / included) for the event, and how many renders it has. Before it's paid the
// event has the trial allowance (renders made then are watermarked like the rest of the unpaid event).
export async function eventAllowance(eventId: string, tenantId: string, settings?: AiSettings, tx: Prisma.TransactionClient = prisma): Promise<Allowance> {
  const s = settings ?? await aiSettings();
  const [payments, gs, tenant] = await Promise.all([
    tx.genieEventPayment.findMany({ where: { eventId, status: 'paid' }, select: { addOns: true, aiRenders: true } }),
    tx.eventGenieSettings.findUnique({ where: { eventId }, select: { addOnsIncluded: true } }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { addOnWaivers: true } }),
  ]);
  const paid = payments.some(p => p.addOns.includes('geniefied'));
  const free = (gs?.addOnsIncluded ?? []).includes('geniefied') || 'geniefied' in addOnWaivers(tenant?.addOnWaivers);
  const covered = paid || free;
  const bought = payments.reduce((n, p) => n + p.aiRenders, 0);
  const total = covered ? bought + (paid ? 0 : s.rendersIncluded) : s.trialRenders;
  const used = await tx.genieAiRender.count({ where: { eventId, counted: true, trial: !covered } });
  return { covered, total, used, left: Math.max(0, total - used) };
}

export type StartResult =
  | { kind: 'existing'; render: GenieAiRender; left: number }
  | { kind: 'started'; render: GenieAiRender; left: number }
  | { kind: 'exhausted' };

// Starts a render once per idempotency key. The allowance check and the insert run under a per-event lock, so two
// iPads can never overspend it.
export async function startRender(input: {
  tenantId: string; eventId: string; sessionClientId: string; shotIndex: number; themeId: string; idempotencyKey: string;
  inputKey: string; consentAcceptedAt: Date; consentTextSha256: string;
}): Promise<StartResult> {
  const settings = await aiSettings();
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ai-render:' + input.eventId}))`;
    const existing = await tx.genieAiRender.findUnique({ where: { eventId_idempotencyKey: { eventId: input.eventId, idempotencyKey: input.idempotencyKey } } });
    const a = await eventAllowance(input.eventId, input.tenantId, settings, tx);
    if (existing) return { kind: 'existing' as const, render: existing, left: a.left };
    if (a.left <= 0) return { kind: 'exhausted' as const };
    const render = await tx.genieAiRender.create({ data: { ...input, trial: !a.covered } });
    return { kind: 'started' as const, render, left: a.left - 1 };
  });
}

// Renders one shot: the input (≤ 2048 px JPEG) and the preamble + theme prompt go to Google; the result is stored with
// the event's gallery files; the input is deleted whatever happens. Never throws.
export async function processRender(renderId: string, faceCount: number): Promise<void> {
  // Claim it (queued → rendering) so a render never runs twice
  const claimed = await prisma.genieAiRender.updateMany({ where: { id: renderId, status: 'queued' }, data: { status: 'rendering', startedAt: new Date() } });
  if (claimed.count === 0) return;
  const r = (await prisma.genieAiRender.findUnique({ where: { id: renderId } }))!;
  const settings = await aiSettings();
  const finish = (data: Partial<GenieAiRender>) => prisma.genieAiRender.update({ where: { id: r.id }, data: { ...data, completedAt: new Date() } });
  try {
    const theme = await prisma.genieAiTheme.findUnique({ where: { id: r.themeId } });
    if (!theme) { await finish({ status: 'failed', counted: false, message: 'This theme was deleted.' }); return; }
    const quality = faceCount === 0 || faceCount >= 3;
    const model = (quality ? theme.qualityModel : theme.fastModel) || (quality ? settings.qualityModel : settings.fastModel);
    await prisma.genieAiRender.update({ where: { id: r.id }, data: { model } });

    const obj = await getR2Object(r.inputKey);
    if (!obj) { await finish({ status: 'failed', counted: false, message: 'The shot wasn’t found in storage.' }); return; }
    const input = await toJpeg(obj.body, AI_INPUT_MAX_SIDE);
    if (!input) { await finish({ status: 'failed', counted: false, message: 'The shot couldn’t be read.' }); return; }

    const out = await renderWithGoogle(input.body, PROMPT_PREAMBLE + '\n\nStyle: ' + theme.prompt, model);
    if (!out.ok) { await finish({ status: out.blocked ? 'blocked' : 'failed', counted: false, message: out.message }); return; }
    const jpeg = await toJpeg(out.image, AI_INPUT_MAX_SIDE, 2);
    if (!jpeg) { await finish({ status: 'failed', counted: false, message: 'The AI result couldn’t be read.' }); return; }
    const resultKey = r.inputKey.replace(/\/[^/]*$/, '/') + 'ai-' + r.id + '.jpg';
    await uploadToR2(resultKey, jpeg.body, 'image/jpeg');
    await finish({
      status: 'done', resultKey, width: jpeg.width, height: jpeg.height,
      estimatedCostCents: quality ? settings.qualityCostCents : settings.fastCostCents,
    });
  } catch (err) {
    console.error('[geniefied] render failed', r.id, err);
    await finish({ status: 'failed', counted: false, message: 'Something went wrong rendering this photo.' }).catch(() => {});
  } finally {
    await deleteFromR2(r.inputKey).catch(err => console.error('[geniefied] input cleanup failed', r.inputKey, err));
  }
}

// A render still queued or rendering after 5 minutes was cut off (the function stopped): it fails and gives the render back
export const STALE_RENDER_MS = 5 * 60_000;
export async function settleStale(r: GenieAiRender, now = new Date()): Promise<GenieAiRender> {
  if ((r.status !== 'queued' && r.status !== 'rendering') || now.getTime() - (r.startedAt ?? r.createdAt).getTime() < STALE_RENDER_MS) return r;
  await deleteFromR2(r.inputKey).catch(() => {});
  return prisma.genieAiRender.update({ where: { id: r.id }, data: { status: 'failed', counted: false, message: 'The render took too long.', completedAt: now } });
}

// AiRenderStatus for the iPad
export async function renderStatus(r: GenieAiRender, rendersLeft: number) {
  const base = { renderId: r.id, status: r.status as 'queued' | 'rendering' | 'done' | 'blocked' | 'failed', rendersLeft };
  if (r.status === 'done' && r.resultKey) {
    return { ...base, resultUrl: await getPresignedDownloadUrl(r.resultKey, 3600), width: r.width!, height: r.height! };
  }
  if (r.status === 'blocked' || r.status === 'failed') return { ...base, ...(r.message ? { message: r.message.slice(0, 300) } : {}) };
  return base;
}

// When an event's gallery is deleted (expiry, or the operator deleting every photo): its Geniefied results go too
export async function deleteEventRenderResults(eventId: string): Promise<number> {
  const rows = await prisma.genieAiRender.findMany({ where: { eventId, resultKey: { not: null } }, select: { id: true, resultKey: true } });
  for (const r of rows) await deleteFromR2(r.resultKey!).catch(err => console.error('[geniefied] result cleanup failed', r.resultKey, err));
  if (rows.length) await prisma.genieAiRender.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { resultKey: null } });
  return rows.length;
}
