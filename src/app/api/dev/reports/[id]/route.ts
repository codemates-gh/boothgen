export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { devAuthorized, devView, findReport } from '@/lib/reports/devApi';
import { Triage, addTeamNote, applyTriage } from '@/lib/reports/triage';
import { loadReport } from '@/lib/reports/server';
import { AttachmentsInput, checkUploads, uploadPrefix } from '@/lib/reports/attachments';

type Ctx = { params: { id: string } };

// One report by number ("12") or id
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const r = await findReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  return NextResponse.json({ report: await devView(r) });
}

const Update = Triage.extend({
  note: z.string().trim().min(1).max(5000).optional(),
  internal: z.boolean().optional(),
  attachments: AttachmentsInput,   // uploaded through /api/dev/reports/upload-url; go with the note
}).strict();

// Update like Super Admin triage: status, fixed in version, how to find it, duplicate, priority, assignedToDev,
// plus an optional note (everyone sees it and the reporter / followers are emailed, unless internal).
// The note is added after the status change, so the thread reads "Status changed to Fixed" then the details.
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const r = await findReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const { note, internal, attachments, ...triage } = parsed.data;
  if (attachments.length && !note) return NextResponse.json({ error: 'Attachments go with a note' }, { status: 400 });
  const uploadError = await checkUploads(uploadPrefix(null), attachments);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });
  if (Object.keys(triage).length) {
    const result = await applyTriage(r, null, triage);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (note) await addTeamNote((await loadReport(r.id))!, null, note, internal === true, attachments);
  return NextResponse.json({ report: await devView((await loadReport(r.id))!) });
}
