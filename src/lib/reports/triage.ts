// Triage changes and team notes, shared by Super Admin → Reports and the Dev API (src/app/api/dev/reports)
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { forEmail, watchersOf, type FullReport } from './server';
import { notifyWatchers } from './notify';
import { REPORT_PRIORITIES, STATUS_VALUES, statusLabel, type ReportAttachment } from './options';

const Link = z.string().trim().max(500).refine(u => u.startsWith('/') || /^https?:\/\//i.test(u), 'The link must start with / or https://');

export const Triage = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(REPORT_PRIORITIES).nullable().optional(),
  fixedInVersion: z.string().trim().max(40).nullable().optional(),
  howToFind: z.string().trim().max(2000).nullable().optional(),   // required with status "exists"
  howToFindUrl: z.union([Link, z.literal('')]).nullable().optional(),
  duplicateOf: z.coerce.number().int().positive().optional(),       // report number; required with status "duplicate"
  assignedToDev: z.boolean().optional(),
}).strict();
export type TriageInput = z.infer<typeof Triage>;

// Applies a triage change. Reporter and followers are told about status / version changes. "Already exists" needs
// the steps to find the feature; "Duplicate" needs the original, and moves votes and followers there.
// actorId: the Super Admin making the change (null for the Dev API; its notes show as Booth Genius).
export async function applyTriage(r: FullReport, actorId: string | null, d: TriageInput): Promise<{ error: string } | { ok: true }> {
  const viewer = { userId: actorId };
  const newStatus = d.status ?? r.status;
  const statusChanged = newStatus !== r.status;

  const howToFind = d.howToFind === undefined ? r.howToFind : (d.howToFind || null);
  const howToFindUrl = d.howToFindUrl === undefined ? r.howToFindUrl : (d.howToFindUrl || null);
  if (newStatus === 'exists' && !howToFind) return { error: 'Add how to find it' };

  let original: { id: string; number: number; userId: string } | null = null;
  if (newStatus === 'duplicate' && (statusChanged || d.duplicateOf)) {
    if (!d.duplicateOf) return { error: 'Enter the number of the original report' };
    original = await prisma.feedbackReport.findUnique({ where: { number: d.duplicateOf }, select: { id: true, number: true, userId: true } });
    if (!original || original.id === r.id) return { error: `Report #${d.duplicateOf} wasn't found` };
  }

  const fixedIn = d.fixedInVersion === undefined ? r.fixedInVersion : (d.fixedInVersion || null);
  const versionChanged = fixedIn !== r.fixedInVersion;
  const howChanged = newStatus === 'exists' && (howToFind !== r.howToFind || howToFindUrl !== r.howToFindUrl);
  const tellWatchers = statusChanged || versionChanged || howChanged || !!original;

  const noteBody = newStatus === 'duplicate' && original ? `Marked as a duplicate of #${original.number}`
    : statusChanged ? `Status changed to ${statusLabel(newStatus)}${newStatus === 'fixed' && fixedIn ? ` (version ${fixedIn})` : ''}`
    : howChanged ? 'Updated how to find it'
    : `Fixed in version ${fixedIn ?? '—'}`;

  // Duplicate: the reporter's and voters' votes and follows move to the original (one per person; the original's
  // reporter already counts). The reporter of the duplicate votes for and follows the original.
  const movers = original
    ? [{ userId: r.userId, voted: true, following: true }, ...r.followers.map(f => ({ userId: f.userId, voted: f.voted, following: f.following }))]
        .filter(m => m.userId !== original!.userId)
    : [];

  await prisma.$transaction([
    prisma.feedbackReport.update({
      where: { id: r.id },
      data: {
        status: newStatus,
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.assignedToDev !== undefined ? { assignedToDev: d.assignedToDev, assignedAt: d.assignedToDev ? (r.assignedToDev ? r.assignedAt : new Date()) : null } : {}),
        fixedInVersion: fixedIn, howToFind, howToFindUrl,
        duplicateOfId: newStatus === 'duplicate' ? (original?.id ?? r.duplicateOfId) : null,
        ...(tellWatchers ? { reporterUnread: true } : {}),
      },
    }),
    ...(tellWatchers ? [
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id, following: true }, data: { unread: true } }),
      prisma.feedbackNote.create({ data: { reportId: r.id, authorId: viewer.userId, fromAdmin: true, body: noteBody } }),
    ] : []),
    ...(original ? [
      ...movers.map(m => prisma.feedbackFollower.upsert({
        where: { reportId_userId: { reportId: original!.id, userId: m.userId } },
        create: { reportId: original!.id, userId: m.userId, voted: m.voted, following: m.following },
        update: { ...(m.voted ? { voted: true } : {}), ...(m.following ? { following: true } : {}) },
      })),
      // The duplicate keeps no votes of its own: they now count on the original
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id }, data: { voted: false } }),
      prisma.feedbackReport.update({ where: { id: original.id }, data: { adminUnread: true }, select: { id: true } }),
    ] : []),
  ]);
  if (tellWatchers) {
    await notifyWatchers(forEmail(r), watchersOf(r), {
      status: newStatus, fixedInVersion: fixedIn, howToFind, howToFindUrl, duplicateOf: original?.number ?? null,
      ...(howChanged && !statusChanged ? { note: 'How to find it was updated.' } : {}),
    });
  }
  return { ok: true };
}

// A team note: visible to everyone (reporter and followers are emailed) unless internal
export async function addTeamNote(r: FullReport, actorId: string | null, body: string, internal: boolean, attachments: ReportAttachment[] = []) {
  await prisma.$transaction([
    prisma.feedbackNote.create({ data: { reportId: r.id, authorId: actorId, fromAdmin: true, internal, body, attachments } }),
    ...(internal ? [] : [
      prisma.feedbackReport.update({ where: { id: r.id }, data: { reporterUnread: true }, select: { id: true } }),
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id, following: true }, data: { unread: true } }),
    ]),
  ]);
  if (!internal) await notifyWatchers(forEmail(r), watchersOf(r), { note: body + (attachments.length ? `\n\n(${attachments.length} attachment${attachments.length > 1 ? 's' : ''} on the report)` : '') });
}
