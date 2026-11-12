import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

// '/' must match exactly — startsWith('/') is true for every route and breaks auth
const PUBLIC_EXACT = new Set(['/']);

const PUBLIC_PREFIX = [
  // Auth
  '/sign-in', '/sign-up', '/forgot-password', '/reset-password',
  '/onboarding', '/invite',
  // Marketing pages
  '/pricing', '/blog', '/contact', '/privacy', '/terms', '/support', '/lifetime',
  // Client-facing pages (unauthenticated)
  '/portal', '/embed', '/g',
  // Static assets (belt-and-suspenders; matcher already excludes most)
  '/_next', '/favicon',
  // Public APIs
  '/api/auth', '/api/public', '/api/portal', '/api/webhooks', '/api/inngest',
  '/api/g', '/api/invite', '/api/support', '/api/og', '/api/lifetime',
  '/api/status',
  // Genie iPads (device bearer token, checked in each route)
  '/api/genie',
];

// Whole path segments only: '/g' covers '/g/<token>' but not '/gallery' or '/genie'
const underPrefix = (pathname: string, p: string) => pathname === p || pathname.startsWith(p + '/');

// Portal client-facing routes — authenticated via portalToken in body, no session required
const PORTAL_CLIENT = [
  /^\/api\/quotes\/[^/]+\/(accept|decline)$/,
  /^\/api\/contracts\/[^/]+\/sign\/client$/,
];

const TENANT = ['/dashboard', '/events', '/clients', '/leads', '/invoices', '/contracts', '/automation', '/settings', '/gallery', '/genie', '/templates'];
const ADMIN  = ['/super-admin', '/api/super-admin'];

// Routes team members cannot access (redirect to /events)
const TEAM_MEMBER_BLOCKED = [
  '/dashboard', '/clients', '/leads', '/quotes', '/invoices',
  '/contracts', '/gallery', '/automation', '/settings', '/genie', '/templates',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIX.some(p => underPrefix(pathname, p))) return NextResponse.next();
  if (PORTAL_CLIENT.some(r => r.test(pathname))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) return NextResponse.redirect(new URL('/sign-in', req.url));

  if (TENANT.some(p => pathname.startsWith(p)) && !token.tenantId) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  if (ADMIN.some(p => pathname.startsWith(p)) && token.globalRole !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Block team members from admin-only pages
  if (token.tenantRole === 'TEAM_MEMBER' && TEAM_MEMBER_BLOCKED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/events', req.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
