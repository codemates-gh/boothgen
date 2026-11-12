'use client';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

// "Already exists": the steps to the feature and a button to open it
export function HowToFind({ steps, url }: { steps: string; url: string | null }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-2">
      <p className="text-sm font-semibold text-green-800 flex items-center gap-2"><Compass className="w-4 h-4" />This already exists in BoothGen. Here&apos;s how to get to it:</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{steps}</p>
      {url && (
        <a href={url} target={url.startsWith('/') ? undefined : '_blank'} rel="noreferrer">
          <Button size="sm" className="mt-1">Take me there</Button>
        </a>
      )}
    </div>
  );
}
