// Email notifications for bug reports and suggestions. Email is best effort: a failed send is logged and never
// fails the report, reply or triage change (in-app unread markers carry the notification either way).
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { areaLabel, statusLabel, typeLabel } from './options';

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com').replace(/\/$/, '');

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(heading: string, lines: string[], link: string, button: string) {
  return '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:18px;color:#111827">' + heading + '</h2>' +
    lines.map(l => '<p style="color:#374151;font-size:14px;white-space:pre-wrap">' + l + '</p>').join('') +
    '<p style="margin:24px 0"><a href="' + link + '" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">' + button + '</a></p>' +
    '<p style="color:#9ca3af;font-size:12px">Booth Genius</p></div>';
}

const excerpt = (s: string, n = 400) => (s.length > n ? s.slice(0, n) + '…' : s);

// Super Admins: SUPER_ADMIN_NOTIFY_EMAIL when set, otherwise every SUPER_ADMIN user
async function adminRecipients(): Promise<string[]> {
  const configured = (process.env.SUPER_ADMIN_NOTIFY_EMAIL ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  const admins = await prisma.user.findMany({ where: { globalRole: 'SUPER_ADMIN' }, select: { email: true } });
  return admins.map(a => a.email);
}

async function send(to: string[], subject: string, html: string, replyTo?: string) {
  for (const addr of to) {
    try {
      const r = await sendEmail(addr, subject, html, replyTo);
      if (!r.success) console.warn('[reports] email not sent:', subject, r.error);
    } catch (err) {
      console.warn('[reports] email not sent:', subject, err);
    }
  }
}

type ReportForEmail = {
  id: string; number: number; type: string; title: string; area: string; details: string;
  user: { name: string; email: string }; tenant?: { name: string } | null;
};

const adminLink = (id: string) => `${appUrl()}/super-admin?tab=reports&report=${id}`;
const reporterLink = (id: string) => `${appUrl()}/reports/${id}`;

export async function notifyAdminsNewReport(r: ReportForEmail) {
  const who = esc(r.user.name) + ' (' + esc(r.user.email) + ')' + (r.tenant ? ' — ' + esc(r.tenant.name) : '');
  await send(await adminRecipients(), `New ${typeLabel(r.type).toLowerCase()} #${r.number}: ${r.title}`,
    layout(`${typeLabel(r.type)} #${r.number}: ${esc(r.title)}`, [who, esc(areaLabel(r.area)), esc(excerpt(r.details))], adminLink(r.id), 'Open in Super Admin'),
    r.user.email);
}

export async function notifyAdminsReply(r: ReportForEmail, body: string) {
  await send(await adminRecipients(), `Reply on #${r.number}: ${r.title}`,
    layout(`${esc(r.user.name)} replied on #${r.number}`, [esc(r.title), esc(excerpt(body))], adminLink(r.id), 'Open in Super Admin'),
    r.user.email);
}

// Reporter and followers: status change (with "how to find it" for Already exists) or a visible note
export async function notifyWatchers(r: ReportForEmail, to: string[], change: {
  status?: string; fixedInVersion?: string | null; note?: string; howToFind?: string | null; howToFindUrl?: string | null; duplicateOf?: number | null;
}) {
  const lines: string[] = [esc(r.title)];
  if (change.status) lines.push('Status: <strong>' + esc(statusLabel(change.status)) + '</strong>' + (change.status === 'fixed' && change.fixedInVersion ? ' in version ' + esc(change.fixedInVersion) : '') + (change.status === 'duplicate' && change.duplicateOf ? ' of #' + change.duplicateOf + ' (you now get its updates)' : ''));
  if (change.status === 'exists' && change.howToFind) {
    lines.push('<strong>This already exists in BoothGen.</strong> How to get to it:');
    lines.push(esc(change.howToFind));
    if (change.howToFindUrl) { const u = absoluteUrl(change.howToFindUrl); lines.push('<a href="' + esc(u) + '" style="color:#F97316">' + esc(u) + '</a>'); }
  }
  if (change.note) lines.push(esc(excerpt(change.note)));
  const subject = change.status
    ? (change.status === 'exists' ? `Already in BoothGen: #${r.number} ${r.title}` : `Report #${r.number} is now ${statusLabel(change.status)}`)
    : `New note on report #${r.number}`;
  await send([...new Set(to)], subject, layout(`Update on report #${r.number}`, lines, reporterLink(r.id), 'View the report'));
}

// Links saved as a BoothGen path ("/genie/sharing") become full URLs
export function absoluteUrl(u: string) {
  return u.startsWith('/') ? appUrl() + u : u;
}
