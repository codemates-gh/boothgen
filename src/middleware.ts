import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/sign-in', '/sign-up', '/portal', '/embed', '/api/public', '/api/webhooks', '/api/auth', '/onboarding', '/_next', '/favicon'];
const TENANT = ['/dashboard', '/events', '/clients', '/invoices', '/contracts', '/automation', '/settings', '/gallery'];
const ADMIN = ['/super-admin', '/api/super-admin'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) return NextResponse.redirect(new URL('/sign-in', req.url));

  if (TENANT.some(p => pathname.startsWith(p)) && !token.tenantId) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  if (ADMIN.some(p => pathname.startsWith(p)) && token.globalRole !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
