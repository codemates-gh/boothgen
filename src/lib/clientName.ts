// How a client is named on events, quotes, invoices and contracts. A client marked Corporate with a company
// shows as "Company c/o Contact" (report #4: the company needs its name on paperwork for approval and accounting).
export type ClientNameParts = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  isCorporate?: boolean | null;
};

export function clientDisplayName(c: ClientNameParts | null | undefined): string {
  if (!c) return '';
  const person = [c.firstName, c.lastName].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
  const company = (c.company ?? '').trim();
  if (c.isCorporate && company) return person ? `${company} c/o ${person}` : company;
  return person;
}
