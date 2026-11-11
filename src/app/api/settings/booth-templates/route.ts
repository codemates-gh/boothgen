export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { operatorClientLibrary } from '@/lib/templates/clientLibrary';

// The layouts this account's clients can pick in their design brief, with Standard ones the operator hid flagged
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await operatorClientLibrary(session.tenantId));
}
