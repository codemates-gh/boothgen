import 'next-auth';
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
