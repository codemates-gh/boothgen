import * as XLSX from 'xlsx';

export interface FieldMapping {
  firstName?: number;
  lastName?: number;
  clientName?: number;
  email?: number;
  phone?: number;
  company?: number;
  eventTitle?: number;
  eventDate?: number;
  venueName?: number;
  venueAddress?: number;
  venueCity?: number;
  venueState?: number;
  startTime?: number;
  endTime?: number;
  packageName?: number;
  internalNotes?: number;
  guestCount?: number;
}

export interface ParsedRow {
  rowIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  eventTitle: string;
  eventDateIso: string | null;
  startTimeStr: string;
  endTimeStr: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueState: string;
  packageName: string;
  internalNotes: string;
  guestCount: number | null;
  error: string | null;
}

export interface ParseResult {
  filename: string;
  headers: string[];
  mapping: FieldMapping;
  detectedFields: string[];
  rows: ParsedRow[];
  totalRows: number;
}

const FIELD_ALIASES: Record<keyof FieldMapping, string[]> = {
  firstName:     ['first name', 'firstname', 'first', 'fname', 'given name'],
  lastName:      ['last name', 'lastname', 'last', 'lname', 'surname', 'family name'],
  clientName:    ['name', 'client name', 'full name', 'customer name', 'contact name', 'client', 'customer'],
  email:         ['email', 'email address', 'e-mail', 'client email', 'contact email', 'mail'],
  phone:         ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'contact phone', 'tel', 'mobile number'],
  company:       ['company', 'organization', 'org', 'business', 'company name', 'employer'],
  eventTitle:    ['event', 'event name', 'event title', 'booking', 'booking name', 'job', 'job name', 'occasion', 'title', 'event description'],
  eventDate:     ['date', 'event date', 'booking date', 'job date', 'wedding date', 'event day', 'party date', 'shoot date'],
  venueName:     ['venue', 'venue name', 'location', 'location name', 'place', 'site'],
  venueAddress:  ['address', 'venue address', 'street', 'street address', 'venue street'],
  venueCity:     ['city', 'venue city', 'town'],
  venueState:    ['state', 'venue state', 'province', 'region'],
  startTime:     ['start time', 'start', 'booth start', 'time start', 'begin time', 'arrival time'],
  endTime:       ['end time', 'end', 'booth end', 'time end', 'finish time', 'end hour'],
  packageName:   ['package', 'package name', 'service', 'service name', 'tier', 'product'],
  internalNotes: ['notes', 'note', 'comments', 'description', 'memo', 'internal notes', 'special instructions', 'remarks'],
  guestCount:    ['guests', 'guest count', 'number of guests', 'attendees', 'headcount', 'pax'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function detectColumns(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof FieldMapping, string[]][]) {
      if (!(field in mapping) && aliases.some(a => norm(a) === n)) {
        (mapping as any)[field] = i;
      }
    }
  });
  return mapping;
}

function cell(row: any[], idx: number | undefined): string {
  if (idx === undefined || idx < 0) return '';
  const v = row[idx];
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const s = String(val).trim();
  if (!s) return null;
  // ISO / standard formats
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  return null;
}

export function parseRow(raw: any[], mapping: FieldMapping, rowIndex: number): ParsedRow {
  // Resolve name: prefer firstName+lastName, fall back to clientName split
  let firstName = cell(raw, mapping.firstName);
  let lastName  = cell(raw, mapping.lastName);
  if (!firstName && !lastName) {
    const full = cell(raw, mapping.clientName);
    const parts = full.split(/\s+/);
    firstName = parts[0] ?? '';
    lastName  = parts.slice(1).join(' ');
  }

  const email         = cell(raw, mapping.email).toLowerCase();
  const phone         = cell(raw, mapping.phone);
  const company       = cell(raw, mapping.company);
  const eventTitle    = cell(raw, mapping.eventTitle);
  const venueName     = cell(raw, mapping.venueName);
  const venueAddress  = cell(raw, mapping.venueAddress);
  const venueCity     = cell(raw, mapping.venueCity);
  const venueState    = cell(raw, mapping.venueState);
  const startTimeStr  = cell(raw, mapping.startTime);
  const endTimeStr    = cell(raw, mapping.endTime);
  const packageName   = cell(raw, mapping.packageName);
  const internalNotes = cell(raw, mapping.internalNotes);
  const guestRaw      = mapping.guestCount !== undefined ? raw[mapping.guestCount] : undefined;
  const guestCount    = guestRaw !== undefined && guestRaw !== '' ? parseInt(String(guestRaw)) || null : null;

  const rawDate       = mapping.eventDate !== undefined ? raw[mapping.eventDate] : undefined;
  const eventDate     = parseExcelDate(rawDate);
  const eventDateIso  = eventDate ? eventDate.toISOString() : null;

  // Validate
  let error: string | null = null;
  if (!email) {
    error = 'Missing email address';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error = `Invalid email: "${email}"`;
  } else if (!firstName && !lastName) {
    error = 'Missing client name';
  } else if (rawDate !== undefined && rawDate !== '' && !eventDate) {
    error = `Cannot parse event date: "${rawDate}"`;
  }

  return {
    rowIndex, firstName, lastName, email, phone, company,
    eventTitle, eventDateIso, startTimeStr, endTimeStr,
    venueName, venueAddress, venueCity, venueState,
    packageName, internalNotes, guestCount, error,
  };
}

export function parseBuffer(buffer: Buffer, filename: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

  if (rawRows.length < 2) {
    return { filename, headers: [], mapping: {}, detectedFields: [], rows: [], totalRows: 0 };
  }

  const headers: string[] = (rawRows[0] as any[]).map(h => String(h).trim());
  const dataRows = (rawRows.slice(1) as any[][]).filter(r => r.some(c => String(c).trim() !== ''));

  const mapping = detectColumns(headers);
  const detectedFields = Object.keys(mapping);
  const rows = dataRows.map((r, i) => parseRow(r, mapping, i + 2)); // +2: 1-indexed + header row

  return { filename, headers, mapping, detectedFields, rows, totalRows: dataRows.length };
}

export function combineDateTime(datePart: string | null, timeStr: string): Date | null {
  if (!datePart) return null;
  const base = new Date(datePart);
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const mer = (m[3] ?? '').toLowerCase();
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  const result = new Date(base);
  result.setHours(h, min, 0, 0);
  return isNaN(result.getTime()) ? null : result;
}

export const SAMPLE_CSV =
  'First Name,Last Name,Email,Phone,Company,Event Name,Event Date,Start Time,End Time,Venue Name,Venue Address,City,State,Package,Notes,Guests\r\n' +
  'Maria,Garcia,maria@example.com,555-0100,,Garcia Wedding,2025-08-15,4:00 PM,10:00 PM,Sunset Ballroom,200 Venue Dr,Orlando,FL,Premium 4-Hour,Setup near main entrance,200\r\n' +
  'James,Lee,james.lee@example.com,555-0200,Lee Corp,Corporate Party,2025-09-20,6:00 PM,9:00 PM,The Grand Hotel,500 Park Ave,Miami,FL,Standard 3-Hour,,120\r\n';
