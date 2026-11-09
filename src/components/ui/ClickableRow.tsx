'use client';

export function ClickableRow({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <tr className={`cursor-pointer hover:bg-gray-50 ${className}`} onClick={() => { window.location.href = href; }}>
      {children}
    </tr>
  );
}
