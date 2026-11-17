// What an operator account bought: the full CRM (Genius, every account so far) or Genie only.
// Plain TypeScript with no server imports: the middleware (edge) uses it too.
// Plan: docs/genie/genie-only-plan.md

export type Product = 'crm' | 'genie';

export const PRODUCTS: Product[] = ['crm', 'genie'];

export const isProduct = (v: unknown): v is Product => v === 'crm' || v === 'genie';

export function isGenieOnly(t: { product?: string | null } | null | undefined): boolean {
  return t?.product === 'genie';
}

// Where a Genie-only operator starts (sign-in, /dashboard)
export const GENIE_HOME = '/genie/events';

// The page shown instead of a CRM page
export const UPGRADE_PATH = '/upgrade';

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(p + '/');

// CRM pages a Genie-only operator can't open. An event's Genie page (/events/<id>/genie) stays open.
const CRM_PAGES = [
  '/calendar', '/events', '/clients', '/leads', '/messages', '/quotes', '/invoices', '/contracts',
  '/automation', '/analytics',
  '/settings/packages', '/settings/team', '/settings/coupons', '/settings/embed', '/settings/checklists',
  '/settings/import', '/settings/print-costs', '/settings/billing',
];

// CRM APIs a Genie-only operator can't call. /api/events/<id>/genie… stays open.
const CRM_APIS = [
  '/api/analytics', '/api/automation', '/api/blackout-dates', '/api/calendar', '/api/clients', '/api/contracts',
  '/api/events', '/api/import', '/api/invoices', '/api/leads', '/api/messages', '/api/quotes', '/api/search',
  '/api/settings/packages', '/api/settings/coupons', '/api/settings/team', '/api/settings/checklist-templates',
  '/api/settings/consumable-profiles', '/api/settings/lead-fields', '/api/settings/design-brief-settings',
  // /api/stripe/billing stays open: subscribing to Genius Pro brings the CRM back
  '/api/stripe/connect',
];

const EVENT_GENIE_PAGE = /^\/events\/[^/]+\/genie(\/|$)/;
const EVENT_GENIE_API = /^\/api\/events\/[^/]+\/genie(\/|$)/;

// What a Genie-only operator gets for a path: null = allowed
export function genieOnlyBlock(pathname: string): { kind: 'home' } | { kind: 'page' } | { kind: 'api' } | null {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return { kind: 'home' };
  if (pathname.startsWith('/api/')) {
    if (EVENT_GENIE_API.test(pathname)) return null;
    return CRM_APIS.some(p => under(pathname, p)) ? { kind: 'api' } : null;
  }
  if (EVENT_GENIE_PAGE.test(pathname)) return null;
  return CRM_PAGES.some(p => under(pathname, p)) ? { kind: 'page' } : null;
}

// Settings tabs (path segment, label) by product
const ALL_SETTINGS_TABS: [string, string][] = [
  ['branding', 'Branding'], ['messaging', 'Email & Texting'], ['packages', 'Packages'], ['billing', 'Billing'], ['team', 'Team'], ['coupons', 'Coupons'],
  ['embed', 'Lead Capture'], ['checklists', 'Checklists'], ['profile', 'Profile'], ['import', 'Import'],
  ['print-costs', 'Print Costs'],
];
export function settingsTabs(product: string | null | undefined): [string, string][] {
  return product === 'genie' ? ALL_SETTINGS_TABS.filter(([h]) => !genieOnlyBlock('/settings/' + h)) : ALL_SETTINGS_TABS;
}
