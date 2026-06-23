import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/', '/sign-in', '/sign-up', '/portal', '/embed', '/api/public', '/api/portal', '/api/webhooks', '/api/auth', '/onboarding', '/_next', '/favicon', '/forgot-password', '/reset-password', '/g', '/api/g', '/invite', '/api/invite', '/support', '/api/support', '/contact'];
// Portal client-facing routes — authenticated via portalToken in body, no session required
const PORTAL_CLIENT = [
  /^\/api\/quotes\/[^/]+\/(accept|decline)$/,
  /^\/api\/contracts\/[^/]+\/sign\/client$/,
];
const TENANT = ['/dashboard', '/events', '/clients', '/leads', '/invoices', '/contracts', '/automation', '/settings', '/gallery'];
const ADMIN = ['/super-admin', '/api/super-admin'];

// Routes team members cannot access (redirect to /events)
const TEAM_MEMBER_BLOCKED = [
  '/dashboard', '/clients', '/leads', '/quotes', '/invoices',
  '/contracts', '/gallery', '/automation', '/settings',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();
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
