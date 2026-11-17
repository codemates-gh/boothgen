'use client';
import { useRouter } from 'next/navigation';

// A table row that opens `href` when clicked anywhere (links and buttons inside it still do their own thing).
// Cmd/Ctrl-click opens it in a new tab.
export function ClickableRow({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer hover:bg-gray-50 ${className}`}
      onClick={e => {
        if ((e.target as HTMLElement).closest('a,button,input,select,textarea')) return;
        if (e.metaKey || e.ctrlKey) { window.open(href, '_blank'); return; }
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
