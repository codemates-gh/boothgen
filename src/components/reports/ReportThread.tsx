'use client';
import { format } from 'date-fns';
import { Lock } from 'lucide-react';

export type ThreadNote = { id: string; body: string; fromAdmin: boolean; internal: boolean; author: string; createdAt: string; attachments?: { index: number; name: string; contentType: string; url: string }[] };

// Notes on a report, oldest first. Team notes are tinted; internal notes (Super Admin only) are marked.
export function ReportThread({ notes, reporterName }: { notes: ThreadNote[]; reporterName?: string }) {
  if (notes.length === 0) return <p className="text-sm text-gray-400">No notes yet.</p>;
  return (
    <ul className="space-y-3">
      {notes.map(n => (
        <li key={n.id} className={`rounded-lg px-4 py-3 text-sm ${n.internal ? 'bg-yellow-50 border border-yellow-100' : n.fromAdmin ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
            {n.internal && <Lock className="w-3 h-3" />}
            <span className="font-medium text-gray-700">{n.author || (n.fromAdmin ? 'Booth Genius' : reporterName ?? 'Reporter')}</span>
            {n.internal && <span>· internal</span>}
            <span>· {format(new Date(n.createdAt), 'MMM d, h:mm a')}</span>
          </p>
          <p className="text-gray-800 whitespace-pre-wrap break-words">{n.body}</p>
          {!!n.attachments?.length && <div className="mt-2"><AttachmentList attachments={n.attachments} /></div>}
        </li>
      ))}
    </ul>
  );
}

export function AttachmentList({ attachments }: { attachments: { index: number; name: string; contentType: string; url: string }[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {attachments.map(a => (
        <a key={a.index} href={a.url} target="_blank" rel="noreferrer" className="block w-28 text-xs text-gray-600 hover:text-[#0085FF]">
          {a.contentType.startsWith('image/') && a.contentType !== 'image/heic' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.name} className="w-28 h-20 object-cover rounded-md border border-gray-200" />
          ) : (
            <div className="w-28 h-20 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] uppercase text-gray-400">
              {a.contentType.split('/')[1]}
            </div>
          )}
          <span className="block truncate mt-1">{a.name}</span>
        </a>
      ))}
    </div>
  );
}
