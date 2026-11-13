#!/usr/bin/env node
// Work on bug reports / suggestions assigned to Dev (Super Admin → Reports → "Assign to Dev").
// Needs REPORTS_DEV_TOKEN (same value as in Vercel) and optionally BOOTHGEN_URL (default https://www.boothgen.com).
// Usage (from the repo root; the token can live in .env, which is not committed):
//   node --env-file=.env scripts/dev-reports.mjs list [--all]
//   node --env-file=.env scripts/dev-reports.mjs show 12 [--download <folder>]
//   node --env-file=.env scripts/dev-reports.mjs update 12 --status fix_ready --fixed-in 2.74.0 --note "What changed + how to check"
//        (after the fix is deployed; never --status fixed: only Booth Genius staff close a report, and the API refuses it)
//        other flags: --priority P1|P2|P3  --internal (note only Super Admins see)  --unassign
//                     --attach shot1.png,shot2.png (screenshots with the note, e.g. the fixed screen)
//                     --how-to-find "Steps" --how-to-find-url /genie/sharing  --duplicate-of 7
// See docs/REPORTS-DEV.md.
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';

const BASE = (process.env.BOOTHGEN_URL || 'https://www.boothgen.com').replace(/\/$/, '');
const TOKEN = process.env.REPORTS_DEV_TOKEN;
if (!TOKEN) { console.error('Set REPORTS_DEV_TOKEN (see docs/REPORTS-DEV.md)'); process.exit(1); }

const [cmd, ref, ...rest] = process.argv.slice(2);
const flags = {};
const args = cmd === 'list' ? [ref, ...rest].filter(Boolean) : rest;
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  const k = args[i].slice(2);
  const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  flags[k] = v;
}

async function api(p, body) {
  const res = await fetch(BASE + '/api/dev/reports' + p, { redirect: 'manual',
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) { console.error(`Error ${res.status}: ${d.error ?? 'request failed'}`); process.exit(1); }
  return d;
}

function print(r) {
  console.log(`#${r.number} [${r.type}] ${r.title}`);
  console.log(`  status: ${r.status}${r.priority ? ' · ' + r.priority : ''}${r.severity ? ' · severity ' + r.severity : ''} · part: ${r.area} · ${r.voteCount} ${r.type === 'suggestion' ? 'votes' : 'affected'}`);
  console.log(`  by ${r.reporter.name}${r.tenant ? ' (' + r.tenant.name + ')' : ''} · BoothGen ${r.appVersion ?? '?'} · page ${r.pageUrl ?? '-'}`);
  if (r.deviceInfo) console.log(`  device: ${r.deviceInfo}`);
  if (r.userAgent) console.log(`  browser: ${r.userAgent}`);
  console.log('\n' + r.details.split('\n').map(l => '  ' + l).join('\n'));
  for (const a of r.attachments) console.log(`  attachment: ${a.name} (${a.contentType}, ${a.bytes} bytes) ${a.url}`);
  for (const n of r.notes) {
    console.log(`  — ${n.author}${n.internal ? ' (internal)' : ''}: ${n.body}`);
    for (const a of n.attachments ?? []) console.log(`      attachment: ${a.name} ${a.url}`);
  }
  console.log(`  open: ${r.link}\n`);
}

if (cmd === 'list') {
  const { reports } = await api(flags.all ? '?all=1' : '');
  if (!reports.length) console.log('Nothing assigned to Dev.');
  reports.forEach(print);
} else if (cmd === 'show' && ref) {
  const { report } = await api('/' + encodeURIComponent(ref));
  print(report);
  if (flags.download) {
    const dir = String(flags.download);
    await mkdir(dir, { recursive: true });
    for (const a of report.attachments) {
      const res = await fetch(a.url);
      const file = path.join(dir, `${report.number}-${a.index}-${path.basename(a.name)}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      console.log('saved', file);
    }
  }
} else if (cmd === 'update' && ref) {
  if (flags.status === 'fixed') {
    console.error('Only Booth Genius staff mark a report Fixed. After deploying, use --status fix_ready --fixed-in <version> --note "<what changed + how to check>".');
    process.exit(1);
  }
  const body = {
    ...(flags.status ? { status: flags.status } : {}),
    ...(flags['fixed-in'] ? { fixedInVersion: flags['fixed-in'] } : {}),
    ...(flags.priority ? { priority: flags.priority } : {}),
    ...(flags['how-to-find'] ? { howToFind: flags['how-to-find'] } : {}),
    ...(flags['how-to-find-url'] ? { howToFindUrl: flags['how-to-find-url'] } : {}),
    ...(flags['duplicate-of'] ? { duplicateOf: Number(flags['duplicate-of']) } : {}),
    ...(flags.unassign ? { assignedToDev: false } : {}),
    ...(typeof flags.note === 'string' ? { note: flags.note, internal: !!flags.internal } : {}),
  };
  if (flags.attach) {
    if (typeof flags.note !== 'string') { console.error('--attach goes with --note'); process.exit(1); }
    const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.pdf': 'application/pdf' };
    body.attachments = [];
    for (const file of String(flags.attach).split(',').map(f => f.trim()).filter(Boolean)) {
      const contentType = TYPES[path.extname(file).toLowerCase()];
      if (!contentType) { console.error(`${file}: attach PNG, JPG, GIF, WebP, MP4, MOV or PDF`); process.exit(1); }
      const bytes = (await stat(file)).size;
      const slot = await api('/upload-url', { contentType, bytes });
      const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: await readFile(file) });
      if (!put.ok) { console.error(`Upload failed for ${file}`); process.exit(1); }
      body.attachments.push({ key: slot.key, name: path.basename(file), contentType, bytes });
    }
  }
  if (!Object.keys(body).length) { console.error('Nothing to update'); process.exit(1); }
  const { report } = await api('/' + encodeURIComponent(ref), body);
  console.log(`#${report.number} updated: ${report.status}${report.fixedInVersion ? ' (' + report.fixedInVersion + ')' : ''}`);
} else {
  console.log('Usage: dev-reports.mjs list [--all] | show <#> [--download <dir>] | update <#> --status fix_ready --fixed-in <version> --note "…"');
  process.exit(1);
}
