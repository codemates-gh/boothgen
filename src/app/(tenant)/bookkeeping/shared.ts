// Types and helpers shared by the Bookkeeping pages
export type Category = { id: string; name: string; type: 'INCOME' | 'EXPENSE'; hidden: boolean; _count?: { transactions: number } };
export type EventOption = { id: string; title: string; eventDate: string };
export type Txn = {
  id: string; date: string; type: 'INCOME' | 'EXPENSE'; amountCents: number; description: string; payee: string | null;
  notes: string | null; categoryId: string | null; source: string; invoiceId: string | null; eventId: string | null;
  receiptUrl: string | null; receiptName: string | null; verified: boolean;
  category: { id: string; name: string } | null; event: { id: string; title: string } | null; invoice: { id: string; invoiceNumber: string } | null;
};

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];

// Upload a receipt straight to storage; returns its link
export async function uploadReceipt(file: File): Promise<{ url: string; name: string }> {
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error('Receipts can be a photo (JPG, PNG, HEIC, WebP) or a PDF');
  if (file.size > 25 * 1024 * 1024) throw new Error('Receipts can be up to 25 MB');
  const res = await fetch('/api/bookkeeping/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type, bytes: file.size }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Upload failed');
  const put = await fetch(body.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!put.ok) throw new Error('Upload failed');
  return { url: body.publicUrl, name: file.name };
}
