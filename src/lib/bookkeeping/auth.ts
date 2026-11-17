// Bookkeeping is for account admins only (team members never see the money)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export async function bookkeeper(): Promise<{ tenantId: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { tenantId: session.tenantId };
}

// Receipts live under this prefix in storage; only links in it can be saved on a transaction
export const receiptPrefix = (tenantId: string) => (process.env.R2_PUBLIC_URL || '') + '/receipts/' + tenantId + '/';
