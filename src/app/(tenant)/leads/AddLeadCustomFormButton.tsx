'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ClipboardList, X } from 'lucide-react';

export default function AddLeadCustomFormButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(600);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pbcrm:resize' && typeof e.data.height === 'number') {
        setHeight(Math.max(400, e.data.height + 24));
      }
      if (e.data?.type === 'pbcrm:lead_captured') {
        setTimeout(() => {
          setOpen(false);
          router.refresh();
        }, 1800);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} size="sm">
        <ClipboardList className="w-4 h-4 mr-1.5" /> Add Lead (Custom Form)
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Add Lead — Custom Form</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-hidden rounded-b-2xl">
              <iframe
                ref={iframeRef}
                src={`/embed/${tenantSlug}/inquiry`}
                style={{ width: '100%', height: `${height}px`, border: 'none', display: 'block' }}
                title="Lead Capture Form"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
