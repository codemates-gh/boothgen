'use client';
// When a page in the app fails in the browser: report what happened (Vercel → Runtime errors, "[client-error]") and
// offer "Try again", which re-renders just this page and usually works without a full reload.
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/errors/report';

export default function TenantError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, 'tenant'); }, [error]);
  return (
    <div className="p-8 flex justify-center">
      <div className="max-w-md w-full text-center mt-16 space-y-4">
        <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
        <h2 className="text-xl font-bold text-[#1F1F3D]">This page hit a problem</h2>
        <p className="text-sm text-gray-500">It&apos;s been reported to us. Try again, or reload the page.</p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => reset()}><RotateCcw className="w-4 h-4 mr-1.5" />Try again</Button>
          <Button variant="outline" onClick={() => location.reload()}>Reload page</Button>
        </div>
        {error?.digest && <p className="text-[11px] text-gray-400">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
