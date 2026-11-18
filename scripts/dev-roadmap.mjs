#!/usr/bin/env node
// Keep the BoothGen roadmap (Super Admin → Reports → Roadmap) up to date from a Claude Code session.
// Same key as scripts/dev-reports.mjs: REPORTS_DEV_TOKEN (as in Vercel), optional BOOTHGEN_URL (default https://www.boothgen.com).
// Roadmap items are separate from reports: the scheduled Dev job never sees them.
// Usage (from the repo root; the token can live in .env, which is not committed):
//   node --env-file=.env scripts/dev-roadmap.mjs list [--status planned|in_progress|testing|shipped]
//   node --env-file=.env scripts/dev-roadmap.mjs show pose-library
//   node --env-file=.env scripts/dev-roadmap.mjs add "Animated GIF" --summary "One line" --area genie_ipad --group next_up
//        [--status planned] [--id gif] [--plan "docs/plan.md P12"] [--target 2027-01-15] [--top | --before <id> | --after <id>]
//   node --env-file=.env scripts/dev-roadmap.mjs update pose-library --status shipped --version 2.110.0
//        other flags: --title --summary --area --group --plan --target --shipped 2026-11-20 --visible on|off
//                     (--plan none / --target none / --version none clear them)
//   node --env-file=.env scripts/dev-roadmap.mjs move gif --top | --bottom | --before <id> | --after <id>
// Values: status planned | in_progress | testing | shipped; area genie_ipad | boothgen | print_box | guest_pages;
// group next_up | essential | later (order applies within a group). Moving to shipped stamps today unless --shipped.
// See docs/REPORTS-DEV.md (Roadmap).

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
  const res = await fetch(BASE + '/api/dev/roadmap' + p, { redirect: 'manual',
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) { console.error(`Error ${res.status}: ${d.error ?? 'request failed'}`); process.exit(1); }
  return d;
}

const GROUPS = { next_up: 'Next up', essential: 'Essential', later: 'Later' };
const line = i => `  ${i.id.padEnd(28)} ${i.status.padEnd(11)} ${i.area.padEnd(11)} ${i.title}`
  + (i.targetDate ? ` (target ${i.targetDate})` : '') + (i.status === 'shipped' ? ` (shipped ${i.shippedAt ?? '?'}${i.shippedVersion ? ', ' + i.shippedVersion : ''})` : '')
  + (i.suggestionCount ? ` · ${i.suggestionCount} suggestion${i.suggestionCount > 1 ? 's' : ''}` : '') + (i.visibleToOperators ? ' · shown to operators' : '');

function print(i) {
  console.log(`${i.title}  [${i.id}]`);
  console.log(`  ${i.summary}`);
  console.log(`  status: ${i.status} · area: ${i.area} · group: ${i.group} (#${i.sortOrder + 1})${i.visibleToOperators ? ' · shown to operators' : ''}`);
  if (i.planRef) console.log(`  plan: ${i.planRef}`);
  if (i.targetDate) console.log(`  target: ${i.targetDate}`);
  if (i.status === 'shipped' || i.shippedVersion) console.log(`  shipped: ${i.shippedAt ?? '?'}${i.shippedVersion ? ' in ' + i.shippedVersion : ''}`);
}

const clear = v => (v === 'none' ? null : v);
function position() {
  if (flags.top) return { top: true };
  if (flags.bottom) return { bottom: true };
  if (flags.before) return { before: flags.before };
  if (flags.after) return { after: flags.after };
  return undefined;
}
function fields() {
  const b = {};
  if (typeof flags.title === 'string') b.title = flags.title;
  if (typeof flags.summary === 'string') b.summary = flags.summary;
  if (typeof flags.status === 'string') b.status = flags.status;
  if (typeof flags.area === 'string') b.area = flags.area;
  if (typeof flags.group === 'string') b.group = flags.group;
  if (typeof flags.plan === 'string') b.planRef = clear(flags.plan);
  if (typeof flags.target === 'string') b.targetDate = clear(flags.target);
  if (typeof flags.shipped === 'string') b.shippedAt = clear(flags.shipped);
  if (typeof flags.version === 'string') b.shippedVersion = clear(flags.version);
  if (typeof flags.visible === 'string') b.visibleToOperators = flags.visible === 'on' || flags.visible === 'true';
  const pos = position();
  if (pos) b.position = pos;
  return b;
}

if (cmd === 'list') {
  const { items } = await api(flags.status ? '?status=' + encodeURIComponent(flags.status) : '');
  if (!items.length) console.log('No roadmap items.');
  const open = items.filter(i => i.status !== 'shipped');
  for (const g of Object.keys(GROUPS)) {
    const inGroup = open.filter(i => i.group === g);
    if (inGroup.length) { console.log(GROUPS[g]); inGroup.forEach(i => console.log(line(i))); }
  }
  const shipped = items.filter(i => i.status === 'shipped');
  if (shipped.length) { console.log('Shipped'); shipped.forEach(i => console.log(line(i))); }
} else if (cmd === 'show' && ref) {
  const { item, suggestions } = await api('/' + encodeURIComponent(ref));
  print(item);
  for (const s of suggestions) console.log(`  suggestion #${s.number} ${s.title} (${s.voteCount} vote${s.voteCount > 1 ? 's' : ''}, ${s.reporterName})`);
} else if (cmd === 'add' && ref) {
  const body = { title: ref, ...fields() };
  if (typeof flags.id === 'string') body.id = flags.id;
  const { item } = await api('', body);
  console.log('Added:'); print(item);
} else if (cmd === 'update' && ref) {
  const body = fields();
  if (!Object.keys(body).length) { console.error('Nothing to change'); process.exit(1); }
  const { item } = await api('/' + encodeURIComponent(ref), body);
  console.log('Updated:'); print(item);
} else if (cmd === 'move' && ref) {
  const pos = position();
  if (!pos) { console.error('Say where: --top, --bottom, --before <id> or --after <id>'); process.exit(1); }
  const { item } = await api('/' + encodeURIComponent(ref), { position: pos });
  console.log('Moved:'); print(item);
} else {
  console.error('Usage: dev-roadmap.mjs list | show <id> | add "Title" --summary … --area … | update <id> … | move <id> --top|--bottom|--before <id>|--after <id>');
  process.exit(1);
}
