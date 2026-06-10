#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function w(p, c) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}
console.log('\n\ud83d\udd12 Adding email/password authentication...\n');

// ── 1. Add passwordHash to schema ─────────────────────────────────────────────
const schemaPath = path.join(ROOT, 'prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');
if (!schema.includes('passwordHash')) {
  schema = schema.replace(
    '  avatarUrl   String?\n  globalRole  GlobalRole',
    '  avatarUrl    String?\n  passwordHash String?\n  globalRole   GlobalRole'
  );
  fs.writeFileSync(schemaPath, schema, 'utf8');
  process.stdout.write('  \u2713 prisma/schema.prisma (added passwordHash)\n');
}

// ── 2. Update package.json ────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.dependencies['bcryptjs']) {
  pkg.dependencies['bcryptjs'] = '^2.4.3';
  pkg.devDependencies['@types/bcryptjs'] = '^2.4.6';
  fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  process.stdout.write('  \u2713 package.json (added bcryptjs)\n');
}

// ── 3. Updated NextAuth config with Credentials provider ─────────────────────
w('src/lib/auth/config.ts', `import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!user || !user.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in', error: '/sign-in' },
  callbacks: {
    async jwt({ token, account, user, trigger }) {
      if (account) {
        if (account.provider === 'credentials' && user) {
          const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
          if (dbUser) {
            token.userId = dbUser.id;
            token.globalRole = dbUser.globalRole;
            await refreshTenant(token);
          }
        } else {
          // Google or other OAuth
          const dbUser = await prisma.user.upsert({
            where: { email: token.email! },
            update: { name: token.name ?? '', avatarUrl: token.picture ?? null, lastLoginAt: new Date() },
            create: { email: token.email!, name: token.name ?? '', avatarUrl: token.picture ?? null },
          });
          token.userId = dbUser.id;
          token.globalRole = dbUser.globalRole;
          await refreshTenant(token);
        }
      }
      if (trigger === 'update') await refreshTenant(token);
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
  if (!token.userId) return;
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
    delete token.tenantId; delete token.tenantRole;
    delete token.tenantSlug; delete token.tenantName; delete token.tenantStatus;
  }
}
`);

// ── 4. Register API ───────────────────────────────────────────────────────────
w('src/app/api/auth/register/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name?.trim() || !email?.trim() || !password)
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing)
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { name: name.trim(), email: email.toLowerCase(), passwordHash } });
  return NextResponse.json({ success: true });
}
`);

// ── 5. Sign-in page (Google + Email) ─────────────────────────────────────────
w('src/app/(auth)/sign-in/[[...sign-in]]/page.tsx', `'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Camera, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) {
      setError('Incorrect email or password. Please try again.');
    } else if (res?.ok) {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mb-4">
            <Camera className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Photo Booth CRM</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleEmail} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required autoComplete="current-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading || !email || !password}
            className="w-full py-2.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"/></div>
          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-medium">or continue with</span></div>
        </div>

        <button onClick={() => signIn('google', { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account? <Link href="/sign-up" className="text-brand font-semibold hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
`);

// ── 6. Sign-up page ───────────────────────────────────────────────────────────
w('src/app/(auth)/sign-up/page.tsx', `'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignUpPage() {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const pwStrength = form.password.length === 0 ? null : form.password.length < 8 ? 'weak' : form.password.length < 12 ? 'good' : 'strong';
  const strengthColor = { weak: 'bg-red-400', good: 'bg-yellow-400', strong: 'bg-green-500' };
  const strengthWidth = { weak: 'w-1/3', good: 'w-2/3', strong: 'w-full' };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, email: form.email, password: form.password }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Registration failed'); setLoading(false); return; }
    // Auto sign in after registration
    await signIn('credentials', { email: form.email, password: form.password, callbackUrl: '/onboarding', redirect: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mb-4">
            <Camera className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start your free trial today</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0"/>{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input type="text" value={form.name} onChange={e => set('name',e.target.value)} placeholder="Jane Smith" required autoComplete="name"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => set('email',e.target.value)} placeholder="you@example.com" required autoComplete="email"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password',e.target.value)} placeholder="Min. 8 characters" required autoComplete="new-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"/>
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
            {pwStrength && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={'h-full rounded-full transition-all ' + (strengthColor[pwStrength] ?? '') + ' ' + (strengthWidth[pwStrength] ?? '')}/>
                </div>
                <p className="text-xs text-gray-400 mt-1 capitalize">{pwStrength} password</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
            <div className="relative">
              <input type="password" value={form.confirm} onChange={e => set('confirm',e.target.value)} placeholder="Re-enter password" required autoComplete="new-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-10"/>
              {form.confirm && form.confirm === form.password && <CheckCircle2 className="w-4 h-4 text-green-500 absolute right-3 top-1/2 -translate-y-1/2"/>}
            </div>
          </div>
          <button type="submit" disabled={loading || !form.name || !form.email || !form.password || !form.confirm}
            className="w-full py-2.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"/></div>
          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-medium">or sign up with</span></div>
        </div>

        <button onClick={() => signIn('google', { callbackUrl: '/onboarding' })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account? <Link href="/sign-in" className="text-brand font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
`);

// ── 7. Update middleware to allow /sign-up ────────────────────────────────────
const mwPath = path.join(ROOT, 'src/middleware.ts');
let mw = fs.readFileSync(mwPath, 'utf8');
if (!mw.includes("'/sign-up'")) {
  mw = mw.replace("'/sign-in(.*)'", "'/sign-in(.*)', '/sign-up'");
  fs.writeFileSync(mwPath, mw, 'utf8');
  process.stdout.write('  \u2713 middleware.ts (added /sign-up to public routes)\n');
}

console.log('\n\u2705 Email auth added!\n');
console.log('Run these commands:');
console.log('  npm install        (installs bcryptjs)');
console.log('  npm run db         (adds passwordHash column)');
console.log('  npm run dev');
console.log('\nUsers can now sign up at /sign-up with email + password');
console.log('or continue using Google sign-in');
