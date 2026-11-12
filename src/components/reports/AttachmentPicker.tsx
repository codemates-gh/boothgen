'use client';
import { useCallback, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, type ReportAttachment } from '@/lib/reports/options';

type Upload = { file: File; status: 'uploading' | 'done' | 'error'; att?: ReportAttachment; error?: string };

async function uploadOne(file: File): Promise<ReportAttachment> {
  const res = await fetch('/api/reports/upload-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, bytes: file.size }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Upload failed');
  const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('Upload failed');
  return { key: d.key, name: file.name, contentType: file.type, bytes: file.size };
}

// Screenshots / photos / videos / PDFs for a report or note: pick files, or paste a screenshot (⌘V / Ctrl+V)
// into the text box (pass onPaste to it). Files upload straight away; `ready` lists the finished ones.
export function useAttachments() {
  const [uploads, setUploadsState] = useState<Upload[]>([]);
  const [error, setError] = useState('');
  const current = useRef<Upload[]>([]);
  const setUploads = useCallback((fn: (u: Upload[]) => Upload[]) => {
    current.current = fn(current.current);
    setUploadsState(current.current);
  }, []);

  const add = useCallback((files: File[]) => {
    setError('');
    const room = ATTACHMENT_MAX_FILES - current.current.length;
    if (files.length > room) setError(`Attach up to ${ATTACHMENT_MAX_FILES} files`);
    for (const raw of files.slice(0, Math.max(0, room))) {
      // Pasted screenshots arrive as "image.png"; give them a clearer name
      const file = raw.name === 'image.png' ? new File([raw], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: raw.type }) : raw;
      if (!(file.type in ATTACHMENT_TYPES)) { setError(`"${file.name}": attach images, videos (MP4/MOV) or PDFs`); continue; }
      if (file.size > ATTACHMENT_MAX_BYTES) { setError(`"${file.name}" is larger than 100 MB`); continue; }
      setUploads(u => [...u, { file, status: 'uploading' }]);
      uploadOne(file)
        .then(att => setUploads(u => u.map(x => x.file === file ? { ...x, status: 'done', att } : x)))
        .catch(e => setUploads(u => u.map(x => x.file === file ? { ...x, status: 'error', error: e.message } : x)));
    }
  }, [setUploads]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) { e.preventDefault(); add(files); }
  }, [add]);

  return {
    uploads, error, add, onPaste,
    remove: (u: Upload) => setUploads(list => list.filter(x => x !== u)),
    reset: () => { setUploads(() => []); setError(''); },
    uploading: uploads.some(u => u.status === 'uploading'),
    ready: uploads.filter(u => u.status === 'done').map(u => u.att!) as ReportAttachment[],
  };
}

export function AttachmentPicker({ state, label = 'Attach screenshots, photos, videos or PDFs' }: { state: ReturnType<typeof useAttachments>; label?: string }) {
  return (
    <div>
      <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0085FF] cursor-pointer hover:underline">
        <Paperclip className="w-4 h-4" />{label}
        <input type="file" multiple className="hidden" accept={Object.keys(ATTACHMENT_TYPES).join(',')} onChange={e => { state.add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      <span className="ml-2 text-xs text-gray-400">or paste a screenshot (⌘V)</span>
      {state.uploads.length > 0 && (
        <ul className="mt-2 space-y-1">
          {state.uploads.map((u, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="truncate flex-1">{u.file.name}</span>
              <span className={u.status === 'error' ? 'text-red-500' : u.status === 'done' ? 'text-green-600' : 'text-gray-400'}>
                {u.status === 'uploading' ? 'Uploading…' : u.status === 'done' ? 'Ready' : u.error}
              </span>
              <button type="button" onClick={() => state.remove(u)} className="text-gray-300 hover:text-gray-500" aria-label="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </div>
  );
}
