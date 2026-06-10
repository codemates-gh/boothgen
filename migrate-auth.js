#!/usr/bin/env node
/**
 * migrate-auth.js
 * Replaces Clerk with NextAuth + Google OAuth
 * Run from inside your project: node migrate-auth.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function w(p, content) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}

console.log('\n\ud83d\udd04 Migrating from Clerk to NextAuth + Google OAuth...\n');

// ── 1. package.json ──────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
delete pkg.dependencies['@clerk/nextjs'];
delete pkg.dependencies['svix'];
pkg.dependencies['next-auth'] = '^4.24.0';
pkg.dependencies['@auth/prisma-adapter'] = '^1.6.0';
w('package.json', JSON.stringify(pkg, null, 2));

// ── 2. NextAuth types ────────────────────────────────────────────────────────
w('src/types/next-auth.d.ts', `import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    userId: string;
    globalRole: string;
    tenantId?: string;
    tenantRole?: string;
    tenant?: { id: string; slug: string; name: string; status: string };
  }
}
declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    globalRole: string;
    tenantId?: string;
    tenantRole?: string;
    tenantSlug?: string;
    tenantName?: string;
    tenantStatus?: string;
  }
}
`);

// ── 3. NextAuth config ───────────────────────────────────────────────────────
w('src/lib/auth/config.ts', `import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma/client';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in', error: '/sign-in' },
  callbacks: {
    async jwt({ token, account, trigger }) {
      // On first sign-in, sync user to DB
      if (account) {
        const user = await prisma.user.upsert({
          where: { email: token.email! },
          update: { name: token.name ?? '', avatarUrl: token.picture ?? null, lastLoginAt: new Date() },
          create: { email: token.email!, name: token.name ?? '', avatarUrl: token.picture ?? null },
        });
        token.userId = user.id;
        token.globalRole = user.globalRole;
        await refreshTenant(token);
      }
      // Refresh after onboarding creates a new tenant
      if (trigger === 'update') {
        await refreshTenant(token);
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.userId;
      session.globalRole = token.globalRole;
      if (token.tenantId) {
        session.tenantId = token.tenantId;
        session.tenantRole = token.tenantRole;
        session.tenant = { id: token.tenantId, slug: token.tenantSlug!, name: token.tenantName!, status: token.tenantStatus! };
      }
      return session;
    },
  },
};

async function refreshTenant(token: any) {
  const m = await prisma.tenantMembership.findFirst({
    where: { userId: token.userId, status: 'ACTIVE' },
    include: { tenant: { select: { id: true, slug: true, name: true, status: true } } },
    orderBy: { joinedAt: 'desc' },
  });
  if (m) {
    token.tenantId = m.tenantId;
    token.tenantRole = m.role;
    token.tenantSlug = m.tenant.slug;
    token.tenantName = m.tenant.name;
    token.tenantStatus = m.tenant.status;
  } else {
    delete token.tenantId;
    delete token.tenantRole;
    delete token.tenantSlug;
    delete token.tenantName;
    delete token.tenantStatus;
  }
}
`);

// ── 4. NextAuth API route ────────────────────────────────────────────────────
w('src/app/api/auth/[...nextauth]/route.ts', `import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/config';
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
`);

// ── 5. Session helper ────────────────────────────────────────────────────────
w('src/lib/auth/session.ts', `import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { redirect } from 'next/navigation';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  return session;
}

export async function requireTenantSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (!session?.tenantId) redirect('/onboarding');
  return session as typeof session & { tenantId: string; tenant: NonNullable<typeof session.tenant> };
}

export async function requireSuperAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (session.globalRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return session;
}
`);

// ── 6. Middleware ────────────────────────────────────────────────────────────
w('src/middleware.ts', `import { getToken } from 'next-auth/jwt';
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

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\\\..*).*)'] };
`);

// ── 7. SessionProvider component ─────────────────────────────────────────────
w('src/components/providers/SessionProvider.tsx', `'use client';
import { SessionProvider as NextAuthProvider } from 'next-auth/react';
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthProvider>{children}</NextAuthProvider>;
}
`);

// ── 8. Root layout ───────────────────────────────────────────────────────────
w('src/app/layout.tsx', `import type { Metadata } from 'next';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

export const metadata: Metadata = { title: 'Photo Booth CRM', description: 'Complete CRM for photo booth operators' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
`);

// ── 9. Root page ─────────────────────────────────────────────────────────────
w('src/app/page.tsx', `import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (session.globalRole === 'SUPER_ADMIN') redirect('/super-admin');
  if (!session.tenantId) redirect('/onboarding');
  redirect('/dashboard');
}
`);

// ── 10. Sign-in page ─────────────────────────────────────────────────────────
w('src/app/(auth)/sign-in/[[...sign-in]]/page.tsx', `'use client';
import { signIn } from 'next-auth/react';
import { Camera } from 'lucide-react';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Camera className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Photo Booth CRM</h1>
        <p className="text-gray-500 text-sm mb-8">Sign in to manage your business</p>
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        <p className="text-xs text-gray-400 mt-6">For photo booth operators only</p>
      </div>
    </div>
  );
}
`);

// ── 11. Onboarding page ──────────────────────────────────────────────────────
w('src/app/onboarding/page.tsx', `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera } from 'lucide-react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { update } = useSession();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create company');
      // Refresh JWT so tenantId is included in session
      await update();
      router.push('/dashboard');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Welcome to Photo Booth CRM</h1>
            <p className="text-sm text-gray-500">Let's set up your company</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pixel Perfect Photo Booths" onKeyDown={e => e.key === 'Enter' && handleCreate()} disabled={loading} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating your company...' : 'Create My Company \u2192'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">You can invite team members and customize branding in settings.</p>
      </div>
    </div>
  );
}
`);

// ── 12. Create-tenant API ─────────────────────────────────────────────────────
w('src/app/api/onboarding/create-tenant/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36); }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  const slug = slugify(name.trim());
  const tenant = await prisma.tenant.create({
    data: {
      name: name.trim(), slug, status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: { create: { companyName: name.trim(), primaryColor: '#F97316', secondaryColor: '#EA6100' } },
      memberships: { create: { userId: session.userId, role: 'HOST_ADMIN', status: 'ACTIVE', joinedAt: new Date() } },
    },
  });
  return NextResponse.json({ success: true, tenantId: tenant.id });
}
`);

// ── 13. Tenant layout ────────────────────────────────────────────────────────
w('src/app/(tenant)/layout.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  await requireTenantSession();
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pl-64 pt-16">{children}</main>
    </div>
  );
}
`);

// ── 14. Super admin layout ────────────────────────────────────────────────────
w('src/app/(platform)/super-admin/layout.tsx', `import { requireSuperAdminSession } from '@/lib/auth/session';
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminSession();
  return <>{children}</>;
}
`);

// ── 15. Sidebar (no Clerk) ───────────────────────────────────────────────────
w('src/components/layout/Sidebar.tsx', `'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, ChevronRight } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/gallery', label: 'Gallery', icon: Camera },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const companyName = session?.tenant?.name ?? 'Loading...';

  return (
    <aside className="w-64 h-screen bg-canvas flex flex-col fixed left-0 top-0 z-40">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Photo Booth CRM</p>
            <p className="text-sidebar-text text-xs truncate max-w-[140px]">{companyName}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors group', active ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white')}>
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-brand' : 'text-sidebar-text group-hover:text-brand')} />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-brand" />}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        {session?.user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-xs font-medium truncate">{session.user.name}</p>
            <p className="text-sidebar-text text-xs truncate">{session.user.email}</p>
          </div>
        )}
        <button onClick={() => signOut({ callbackUrl: '/sign-in' })} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white w-full transition-colors">
          <LogOut className="w-4 h-4" />Sign Out
        </button>
      </div>
    </aside>
  );
}
`);

// ── 16. TopBar (no Clerk UserButton) ─────────────────────────────────────────
w('src/components/layout/TopBar.tsx', `import { Bell } from 'lucide-react';
export function TopBar({ title }: { title: string }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 fixed right-0 left-64 top-0 z-30">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <button className="text-gray-400 hover:text-gray-600"><Bell className="w-5 h-5" /></button>
    </header>
  );
}
`);

// ── 17. Dashboard page ───────────────────────────────────────────────────────
w('src/app/(tenant)/dashboard/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Calendar, Users, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [upcomingEvents, totalClients, newLeads, tenant, revenue] = await Promise.all([
    prisma.event.findMany({ where: { tenantId, eventDate: { gte: now }, status: { not: 'CANCELLED' } }, include: { client: true }, orderBy: { eventDate: 'asc' }, take: 8 }),
    prisma.client.count({ where: { tenantId } }),
    prisma.leadSubmission.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { branding: true } }),
    prisma.payment.aggregate({ where: { tenantId, paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
  ]);

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const stats = [
    { label: 'Upcoming Events', value: upcomingEvents.length, icon: Calendar, color: 'text-brand' },
    { label: 'Total Clients', value: totalClients, icon: Users, color: 'text-blue-500' },
    { label: 'New Leads (Month)', value: newLeads, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Revenue (Month)', value: fmt(revenue._sum.amountCents ?? 0), icon: DollarSign, color: 'text-green-500' },
  ];

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-8 space-y-8">
        {tenant?.status === 'TRIAL' && tenant.trialEndsAt && (
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-center justify-between">
            <div><p className="font-semibold text-brand-dark">Free Trial Active</p><p className="text-sm text-gray-600">Trial ends {format(tenant.trialEndsAt, 'MMMM d, yyyy')}</p></div>
            <Link href="/settings/billing"><Button size="sm">Upgrade Plan</Button></Link>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map(s => (
            <Card key={s.label}><CardContent className="pt-6"><div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{s.label}</p><s.icon className={'w-5 h-5 ' + s.color} /></div><p className="text-2xl font-bold">{s.value}</p></CardContent></Card>
          ))}
        </div>
        <Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>Upcoming Events</CardTitle><Link href="/events/new"><Button size="sm"><Plus className="w-4 h-4 mr-1"/>New Event</Button></Link></div></CardHeader>
          <CardContent className="p-0">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><Calendar className="w-10 h-10 mx-auto mb-3 opacity-40"/><p>No upcoming events. <Link href="/events/new" className="text-brand hover:underline">Create one</Link></p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {upcomingEvents.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium">{ev.title}</p><p className="text-sm text-gray-500">{ev.venueName ?? 'Venue TBD'}</p></td>
                      <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{format(ev.eventDate, 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status}</Badge></td>
                      <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// ── 18. API routes (replace Clerk auth) ──────────────────────────────────────
w('src/app/api/events/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { firstName, lastName, email, phone, title, eventDate, startTime, endTime, venueName, venueAddress, venueCity, venueState, packageName, guestCount, internalNotes, status } = body;
  if (!firstName || !lastName || !email || !title || !eventDate) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const client = await prisma.client.upsert({ where: { tenantId_email: { tenantId: session.tenantId, email } }, update: { firstName, lastName, phone: phone || null }, create: { tenantId: session.tenantId, firstName, lastName, email, phone: phone || null } });
  const event = await prisma.event.create({ data: { tenantId: session.tenantId, clientId: client.id, title, status: status || 'LEAD', eventDate: new Date(eventDate), startTime: startTime ? new Date(eventDate + 'T' + startTime) : null, endTime: endTime ? new Date(eventDate + 'T' + endTime) : null, venueName: venueName || null, venueAddress: venueAddress || null, venueCity: venueCity || null, venueState: venueState || null, packageName: packageName || null, guestCount: guestCount ? parseInt(guestCount) : null, internalNotes: internalNotes || null } });
  return NextResponse.json(event, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
`);

w('src/app/api/events/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(event);
}
`);

w('src/app/api/invoices/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { clientEmail, eventId, dueDate, retainerPercent, retainerAmountCents, taxRateBps, taxAmountCents, subtotalCents, totalCents, balanceDueCents, notes, lineItems } = body;
  const client = await prisma.client.findFirst({ where: { tenantId: session.tenantId, email: clientEmail } });
  if (!client) return NextResponse.json({ error: 'Client not found: ' + clientEmail }, { status: 404 });
  const count = await prisma.invoice.count({ where: { tenantId: session.tenantId } });
  const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0');
  const invoice = await prisma.invoice.create({ data: { tenantId: session.tenantId, clientId: client.id, eventId: eventId || null, invoiceNumber, status: 'DRAFT', dueDate: dueDate ? new Date(dueDate) : null, retainerPercent: retainerPercent || null, retainerAmountCents: retainerAmountCents || null, taxRateBps: taxRateBps || 0, taxAmountCents: taxAmountCents || 0, subtotalCents, totalCents, balanceDueCents, notes: notes || null, lineItems: { create: (lineItems ?? []).map((li: any, i: number) => ({ description: li.description, quantity: li.quantity, unitCents: li.unitCents, totalCents: li.totalCents, taxable: li.taxable ?? true, sortOrder: i })) } } });
  return NextResponse.json(invoice, { status: 201 });
}
`);

w('src/app/api/contracts/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, eventId, templateId } = await req.json();
  let template = templateId ? await prisma.contractTemplate.findFirst({ where: { id: templateId, tenantId: tenant.id } }) : await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!template) template = await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id } });
  const templateContent = template?.bodyHtml ?? '<p>Agreement between {{host.company_name}} and {{client.full_name}}.</p>';
  let clientId: string | null = null; let renderedContent = templateContent;
  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: tenant.id }, include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } } } });
    if (event) { clientId = event.clientId; const ctx = buildCtx({ client: event.client, event, invoice: event.invoices[0] ?? null, contract: null, branding: tenant.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' }); renderedContent = parseMergeTags(templateContent, ctx); }
  }
  if (!clientId) { const latestEvent = await prisma.event.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } }); if (!latestEvent) return NextResponse.json({ error: 'No clients found. Create an event first.' }, { status: 400 }); clientId = latestEvent.clientId; }
  const contract = await prisma.contract.create({ data: { tenantId: tenant.id, clientId, eventId: eventId ?? null, templateId: template?.id ?? null, title: title ?? 'Service Agreement', status: 'DRAFT', templateContent, renderedContent } });
  return NextResponse.json(contract, { status: 201 });
}
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const contracts = await prisma.contract.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(contracts);
}
`);

w('src/app/api/contracts/[id]/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(c);
}
`);

w('src/app/api/contracts/templates/route.ts', `import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const templates = await prisma.contractTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  return NextResponse.json(templates);
}
`);

w('src/app/api/settings/branding/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId } });
  return NextResponse.json(b ?? {});
}
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const b = await prisma.tenantBranding.upsert({ where: { tenantId: session.tenantId }, update: body, create: { tenantId: session.tenantId, ...body } });
  return NextResponse.json(b);
}
`);

w('src/app/api/super-admin/metrics/route.ts', `import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [total, active, trial, suspended, hosts] = await Promise.all([
    prisma.tenant.count(), prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'TRIAL' } }), prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } } } }),
  ]);
  return NextResponse.json({ overview: { total, active, trial, suspended }, hosts });
}
`);

// ── 19. Super admin page ─────────────────────────────────────────────────────
w('src/app/(platform)/super-admin/page.tsx', `import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Camera, Users, TrendingUp, AlertTriangle } from 'lucide-react';

const SC: Record<string,any> = { TRIAL:'warning', ACTIVE:'success', SUSPENDED:'danger', CANCELLED:'default' };
const CS: Record<string,any> = { NOT_CONNECTED:'default', ONBOARDING_INITIATED:'info', ACTIVE:'success', RESTRICTED:'warning', DEAUTHORIZED:'danger' };

export default async function SuperAdminPage() {
  await requireSuperAdminSession();
  const [tenants, totalUsers, totalEvents] = await Promise.all([
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } }, branding: { select: { companyName: true } } } }),
    prisma.user.count(), prisma.event.count(),
  ]);
  const ov = { total: tenants.length, active: tenants.filter(t => t.status==='ACTIVE').length, trial: tenants.filter(t => t.status==='TRIAL').length, suspended: tenants.filter(t => t.status==='SUSPENDED').length };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/><span className="font-bold">Photo Booth CRM</span>
        <span className="text-white/30 mx-2">|</span><span className="text-sm text-white/70">Super Admin Console</span>
      </div>
      <div className="p-8 space-y-8">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {([['Total Hosts',ov.total,Users,'text-brand'],['Active',ov.active,TrendingUp,'text-green-500'],['Trial',ov.trial,Camera,'text-yellow-500'],['Suspended',ov.suspended,AlertTriangle,'text-red-500']] as any[]).map(([label,val,Icon,color]: any) => (
            <Card key={label}><CardContent className="pt-6"><div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{label}</p><Icon className={'w-5 h-5 ' + color}/></div><p className="text-3xl font-bold">{val}</p></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalUsers}</p><p className="text-sm text-gray-500 mt-1">Total Users</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalEvents}</p><p className="text-sm text-gray-500 mt-1">Total Events</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{tenants.filter(t=>t.stripeConnect?.chargesEnabled).length}</p><p className="text-sm text-gray-500 mt-1">Stripe Connected</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>All Hosts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Company</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stripe</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{t.branding?.companyName ?? t.name}</p><p className="text-xs text-gray-400">/{t.slug}</p></td>
                    <td className="px-6 py-4"><Badge variant={SC[t.status]}>{t.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.stripeSubscription?.plan ?? 'Trial'}</td>
                    <td className="px-6 py-4"><Badge variant={CS[t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED']} className="text-xs">{t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED'}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t._count.events}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(t.createdAt,'MMM d, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

// ── 20. Contracts [id] sign host (NextAuth) ───────────────────────────────────
w('src/app/api/contracts/[id]/sign/host/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { generateLockedContractPdf } from '@/lib/contracts/pdf-generator';

const Schema = z.object({ signatureDataUrl: z.string().regex(/^data:image\\/png;base64,[A-Za-z0-9+/]+=*$/).max(500000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 422 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already executed', pdfUrl: contract.pdfUrl }, { status: 409 });
  if (contract.hostSignedAt) return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  const now = new Date();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const newStatus = contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED';
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  await prisma.contract.update({ where: { id: contract.id }, data: { hostSignatureData: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, hostSignedByUserId: user?.id, status: newStatus } });
  let pdfUrl: string | undefined;
  if (newStatus === 'FULLY_EXECUTED' && contract.clientSignedAt && contract.clientSignatureData) {
    try {
      const b = contract.tenant.branding;
      const r = await generateLockedContractPdf({ contractId: contract.id, tenantId: contract.tenantId, title: contract.title, renderedContent: contract.renderedContent, clientFullName: contract.client.firstName + ' ' + contract.client.lastName, clientEmail: contract.client.email, clientSignatureDataUrl: contract.clientSignatureData, clientSignedAt: contract.clientSignedAt, clientIpAddress: contract.clientIpAddress ?? 'unknown', hostFullName: user?.name ?? 'Authorized Representative', hostEmail: user?.email ?? '', hostSignatureDataUrl: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, branding: { companyName: b?.companyName ?? contract.tenant.name, primaryColor: b?.primaryColor ?? '#F97316', logoUrl: b?.logoUrl ?? undefined } });
      pdfUrl = r.pdfUrl;
      await prisma.contract.update({ where: { id: contract.id }, data: { pdfUrl: r.pdfUrl, contentHash: r.contentHash, pdfLockedAt: now } });
    } catch (e) { console.error('[PDF]', e); }
  }
  return NextResponse.json({ success: true, status: newStatus, pdfUrl: pdfUrl ?? null });
}
`);

w('src/app/api/contracts/[id]/send/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendContractLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { expiryDays = 14 } = await req.json().catch(() => ({}));
  const expiresAt = new Date(Date.now() + expiryDays * 86400000);
  await prisma.contract.update({ where: { id: contract.id }, data: { status: 'SENT_TO_CLIENT', expiresAt } });
  const portalToken = (contract.event as any)?.portalToken ?? '';
  await sendContractLink({ to: contract.client.email, firstName: contract.client.firstName, companyName: contract.tenant.branding?.companyName ?? contract.tenant.name, contractTitle: contract.title, portalUrl: APP + '/portal/' + portalToken, expiresAt });
  return NextResponse.json({ success: true, expiresAt });
}
`);

w('src/app/api/invoices/[id]/send/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendInvoiceLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const portalUrl = inv.event ? APP + '/portal/' + (inv.event as any).portalToken : APP;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  await sendInvoiceLink({ to: inv.client.email, firstName: inv.client.firstName, companyName: tenant.branding?.companyName ?? tenant.name, invoiceNumber: inv.invoiceNumber, totalFormatted: fmt(inv.totalCents), portalUrl });
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'SENT' } });
  return NextResponse.redirect(new URL('/invoices/' + inv.id, APP));
}
`);

// ── 21. Stripe Connect (NextAuth) ──────────────────────────────────────────────
w('src/app/api/stripe/connect/authorize/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP = process.env.NEXT_PUBLIC_APP_URL!;
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.redirect(new URL('/sign-in', req.url));
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeConnect: true, branding: true } });
  if (!tenant) return NextResponse.redirect(new URL('/dashboard', req.url));
  let accountId: string;
  if (tenant.stripeConnect?.stripeAccountId && tenant.stripeConnect.onboardingStatus !== 'DEAUTHORIZED') {
    accountId = tenant.stripeConnect.stripeAccountId;
  } else {
    const acct = await stripe.accounts.create({ type: 'express', capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, business_profile: { name: tenant.branding?.companyName ?? tenant.name, mcc: '7929' }, metadata: { tenant_id: tenant.id } });
    accountId = acct.id;
    await prisma.stripeConnectAccount.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED', livemode: acct.livemode }, update: { stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED' } });
  }
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: APP + '/api/stripe/connect/authorize', return_url: APP + '/api/stripe/connect/callback?account_id=' + accountId + '&tenant_id=' + tenant.id, type: 'account_onboarding' });
  return NextResponse.redirect(link.url);
}
`);

// ── 22. .env additions ────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, 'utf8');
  if (!env.includes('GOOGLE_CLIENT_ID')) {
    env += `
# ─── GOOGLE OAUTH (NextAuth) ──────────────────────────────────────────────────
# From: console.cloud.google.com → APIs & Services → Credentials → Create OAuth client
# Application type: Web application
# Authorized redirect URI: http://localhost:3000/api/auth/callback/google
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="replace-with-random-32-char-string"
NEXTAUTH_URL="http://localhost:3000"
`;
    fs.writeFileSync(envPath, env);
    process.stdout.write('  \u2713 .env.local (appended Google OAuth vars)\n');
  }
}

// ── Verification ──────────────────────────────────────────────────────────────
console.log('\n\u2705 Migration complete!\n');
console.log('Next steps:');
console.log('  1. Run: npm install');
console.log('  2. Set up Google OAuth:');
console.log('     - Go to console.cloud.google.com');
console.log('     - Create project (or use existing)');
console.log('     - APIs & Services -> Credentials -> Create OAuth client ID');
console.log('     - Application type: Web application');
console.log('     - Authorized redirect URI: http://localhost:3000/api/auth/callback/google');
console.log('     - Copy Client ID + Secret into .env.local');
console.log('  3. Generate NEXTAUTH_SECRET:');
console.log('     openssl rand -base64 32');
console.log('  4. Set in .env.local: NEXTAUTH_SECRET="<output from above>"');
console.log('  5. Update .env (Prisma) with same vars if needed');
console.log('  6. Run: npm run dev');
console.log('  7. Go to http://localhost:3000 -> Sign in with Google');
console.log('\nFor SUPER_ADMIN: sign in, then run this SQL in Neon console:');
console.log('  UPDATE users SET global_role=\'SUPER_ADMIN\' WHERE email=\'your@email.com\';');
