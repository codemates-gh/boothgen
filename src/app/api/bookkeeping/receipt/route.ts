export const dynamic = 'force-dynamic';
// Upload link for a receipt (photo or PDF, up to 25 MB; the size is signed into the link)
import { NextRequest, NextResponse } from 'next/server';
import { bookkeeper, receiptPrefix } from '@/lib/bookkeeping/auth';
import { getPresignedUploadUrl } from '@/lib/storage/r2';

const TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
const MAX = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const { fileName, contentType, bytes } = await req.json().catch(() => ({}));
  if (!TYPES.includes(contentType)) return NextResponse.json({ error: 'Receipts can be a photo (JPG, PNG, HEIC, WebP) or a PDF' }, { status: 400 });
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX) return NextResponse.json({ error: 'Receipts can be up to 25 MB' }, { status: 400 });
  const key = 'receipts/' + who.tenantId + '/' + Date.now() + '-' + String(fileName ?? 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const uploadUrl = await getPresignedUploadUrl(key, contentType, bytes);
  const publicUrl = receiptPrefix(who.tenantId) + key.split('/').slice(2).join('/');
  return NextResponse.json({ uploadUrl, publicUrl });
}
