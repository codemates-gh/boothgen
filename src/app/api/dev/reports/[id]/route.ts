export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { devAuthorized, devView, findReport, jargonIn } from '@/lib/reports/devApi';
import { Triage, addTeamNote, applyTriage } from '@/lib/reports/triage';
import { loadReport } from '@/lib/reports/server';
import { AttachmentsInput, checkUploads, uploadPrefix } from '@/lib/reports/attachments';

type Ctx = { params: Promise<{ id: string }> };

// One report by number ("12") or id
export async function GET(req: NextRequest, props: Ctx) {
  const params = await props.params;
  const denied = devAuthorized(req);
  if (denied) return denied;
  const r = await findReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  return NextResponse.json({ report: await devView(r) });
}

const Update = Triage.extend({
  note: z.string().trim().min(1).max(5000).optional(),
  // Notes are internal (Super Admins only) unless public: true; internal: false is accepted for older callers
  public: z.boolean().optional(),
  internal: z.boolean().optional(),
  attachments: AttachmentsInput,   // uploaded through /api/dev/reports/upload-url; go with the note
}).strict();

// Update like Super Admin triage: status, fixed in version, how to find it, duplicate, priority, assignedToDev,
// plus an optional note: internal (Super Admins only) by default; with public: true everyone sees it, the reporter
// and followers are emailed, and it must be plain language (no technical or AI wording).
// The note is added after the status change, so the thread reads "Fix is live…" then the details.
// Never "fixed" or "dev_approved": only G closes a report or approves shipping a fix.
export async function POST(req: NextRequest, props: Ctx) {
  const params = await props.params;
  const denied = devAuthorized(req);
  if (denied) return denied;
  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const r = await findReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  // Only BoothGen staff close a report: the Dev API stops at Fix ready (fix deployed, waiting to be checked)
  if (parsed.data.status === 'fixed') {
    return NextResponse.json({ error: 'Only BoothGen staff can mark a report Fixed. Use status fix_ready once the fix is deployed.' }, { status: 403 });
  }
  if (parsed.data.status === 'dev_approved') {
    return NextResponse.json({ error: 'Only BoothGen staff approve shipping a fix. Use status dev_review to ask for approval.' }, { status: 403 });
  }
  const { note, internal: internalFlag, public: publicFlag, attachments, ...triage } = parsed.data;
  const internal = !(publicFlag === true || internalFlag === false);
  if (note && !internal) {
    const word = jargonIn(note);
    if (word) return NextResponse.json({ error: `Testers see this note: keep it plain, without technical or AI wording ("${word}"). Put details in an internal note.` }, { status: 400 });
  }
  if (attachments.length && !note) return NextResponse.json({ error: 'Attachments go with a note' }, { status: 400 });
  const uploadError = await checkUploads(uploadPrefix(null), attachments);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });
  if (Object.keys(triage).length) {
    const result = await applyTriage(r, null, triage);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (note) await addTeamNote((await loadReport(r.id))!, null, note, internal, attachments);
  return NextResponse.json({ report: await devView((await loadReport(r.id))!) });
}
