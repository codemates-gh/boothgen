// Screenshots, photos, videos and PDFs on reports and notes: uploaded by the browser straight to R2 (private),
// then checked here before they're saved. Each uploader has its own key prefix.
import { z } from 'zod';
import { headR2Object } from '@/lib/storage/r2';
import { ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, type ReportAttachment } from './options';

export const AttachmentInput = z.object({
  key: z.string().max(200),
  name: z.string().trim().min(1).max(200),
  contentType: z.string().refine(t => t in ATTACHMENT_TYPES),
  bytes: z.number().int().min(1),
}).strict();
export const AttachmentsInput = z.array(AttachmentInput).max(ATTACHMENT_MAX_FILES, `Attach up to ${ATTACHMENT_MAX_FILES} files`).default([]);

export const uploadPrefix = (userId: string | null) => `reports/${userId ?? 'dev'}/`;

// Each file must be the uploader's own and finished uploading; sizes are taken from storage. Returns an error or null.
export async function checkUploads(prefix: string, list: ReportAttachment[]): Promise<string | null> {
  for (const a of list) {
    if (!a.key.startsWith(prefix)) return 'Attachment not found';
    const head = await headR2Object(a.key);
    if (!head) return `"${a.name}" didn't finish uploading. Remove it and try again.`;
    a.bytes = head.bytes;
  }
  return null;
}
