'use client';
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

// Icon-only "copy link" button (client portal link on the event page)
export default function CopyLinkButton({ url, label = 'Copy link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? 'Copied' : label}
      onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-[#F5F6F8] hover:text-[#1F1F3D] transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />}
    </button>
  );
}
