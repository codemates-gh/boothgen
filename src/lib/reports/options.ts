// Choices for bug reports and suggestions (shared by the report form, My reports and Super Admin triage)

export const REPORT_TYPES = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
] as const;

export const REPORT_AREAS = [
  { value: 'genie_guest', label: 'Genie iPad: guest screens' },
  { value: 'genie_attendant', label: 'Genie iPad: attendant panel' },
  { value: 'printing', label: 'Printing / print box' },
  { value: 'booth_wifi', label: 'Booth Wi-Fi' },
  { value: 'sharing', label: 'Sharing (text, email, QR)' },
  { value: 'guest_page', label: 'Guest photo page' },
  { value: 'website', label: 'BoothGen website' },
  { value: 'camera', label: 'Camera' },
  { value: 'other', label: 'Other' },
] as const;

export const REPORT_SEVERITIES = [
  { value: 'blocker', label: 'Blocks the event' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'cosmetic', label: 'Cosmetic' },
] as const;

export const REPORT_STATUSES = [
  { value: 'new', label: 'New', badge: 'danger' },
  { value: 'need_info', label: 'Need more info', badge: 'warning' },
  { value: 'confirmed', label: 'Confirmed', badge: 'info' },
  { value: 'in_progress', label: 'In progress', badge: 'brand' },
  // The fix is deployed; Booth Genius checks it, then marks it Fixed (only staff can; the Dev API stops here)
  { value: 'fix_ready', label: 'Fix ready', reporterLabel: 'Fix is live, being checked', badge: 'info' },
  { value: 'fixed', label: 'Fixed', badge: 'success' },
  { value: 'wont_fix', label: "Won't fix", badge: 'default' },
  { value: 'duplicate', label: 'Duplicate', badge: 'default' },
  { value: 'exists', label: 'Already exists', badge: 'success' },
] as const;

// Still being worked on; the Reports board shows these by default
export const OPEN_STATUSES = ['new', 'need_info', 'confirmed', 'in_progress', 'fix_ready'];

export const REPORT_PRIORITIES = ['P1', 'P2', 'P3'] as const;

type Opt = { value: string; label: string };
const labelOf = (list: readonly Opt[], v: string | null | undefined) => list.find(o => o.value === v)?.label ?? v ?? '';
export const typeLabel = (v: string) => labelOf(REPORT_TYPES, v);
export const areaLabel = (v: string) => labelOf(REPORT_AREAS, v);
export const severityLabel = (v: string | null | undefined) => labelOf(REPORT_SEVERITIES, v);
export const statusLabel = (v: string) => labelOf(REPORT_STATUSES, v);
// What reporters and followers see (pages and emails)
export const reporterStatusLabel = (v: string) => {
  const s = REPORT_STATUSES.find(o => o.value === v);
  return s && 'reporterLabel' in s ? s.reporterLabel : statusLabel(v);
};
// Statuses that show the fixed-in version
export const showsVersion = (v: string) => v === 'fixed' || v === 'fix_ready';
export const statusBadge = (v: string) => (REPORT_STATUSES.find(s => s.value === v)?.badge ?? 'default') as any;

const values = <T extends readonly Opt[]>(list: T) => list.map(o => o.value) as unknown as [T[number]['value'], ...T[number]['value'][]];
export const TYPE_VALUES = values(REPORT_TYPES);
export const AREA_VALUES = values(REPORT_AREAS);
export const SEVERITY_VALUES = values(REPORT_SEVERITIES);
export const STATUS_VALUES = values(REPORT_STATUSES);

// Attachments: screenshots, photos, short videos and PDFs, uploaded straight to R2
export const ATTACHMENT_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf',
};
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;

export type ReportAttachment = { key: string; name: string; contentType: string; bytes: number };
