'use client';
// Last-resort error screen (the root layout itself failed): report it and offer a reload
import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/report';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { reportClientError(error, 'global'); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#F5F6F8' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h2 style={{ color: '#1F1F3D', margin: '0 0 8px' }}>This page couldn&apos;t load</h2>
          <p style={{ color: '#676879', fontSize: 14, margin: '0 0 16px' }}>It&apos;s been reported to us. Reload to try again.</p>
          <button onClick={() => location.reload()} style={{ background: '#1F1F3D', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
