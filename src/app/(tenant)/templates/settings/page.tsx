'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { DesignBriefSettings } from '@/components/settings/DesignBriefSettings';

// Account-wide template settings (was Settings → Booth Templates)
export default function TemplateSettingsPage() {
  return (
    <>
      <TopBar title="Template Settings"/>
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <Link href="/templates" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Templates</Link>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Template Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Settings for all your events.</p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-bold">Client Design Brief</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Clients pick a layout and choose colors, fonts and text in their portal before you design. They pick from your offered templates and the
              Standard layouts you haven&apos;t hidden in <Link href="/templates" className="text-brand hover:underline">Templates</Link>. Turn it on per event on the event&apos;s Designs tab.
            </p>
          </div>
          <DesignBriefSettings/>
        </div>
      </div>
    </>
  );
}
