
import { put, del } from '@vercel/blob';
export async function uploadContractPdf(buf: Buffer, blobPath: string): Promise<string> {
  const blob = await put(blobPath, buf, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false, cacheControlMaxAge: 31536000 });
  return blob.url;
}
export async function uploadGalleryAsset(buf: Buffer, path: string, mimeType: string): Promise<string> {
  const blob = await put(path, buf, { access: 'public', contentType: mimeType, addRandomSuffix: false });
  return blob.url;
}
export async function deleteBlob(url: string) { try { await del(url); } catch (e) { console.warn('blob delete failed', e); } }
