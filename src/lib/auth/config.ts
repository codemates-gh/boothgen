import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: 'select_account' } },
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
      if (trigger === 'update') {
        await refreshTenant(token);
        if (token.userId) {
          const u = await prisma.user.findUnique({ where: { id: token.userId as string }, select: { name: true } });
          if (u) token.name = u.name;
        }
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
