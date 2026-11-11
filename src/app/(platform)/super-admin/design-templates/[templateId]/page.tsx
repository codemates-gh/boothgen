'use client';
import { useParams } from 'next/navigation';
import { Camera } from 'lucide-react';
import { TemplateDesigner } from '@/components/genie/TemplateDesigner';

// Super Admin → Design Templates: BoothGen designs the Standard layouts operators and their clients pick from
export default function StandardTemplateDesignerPage() {
  const { templateId } = useParams<{ templateId: string }>();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/>
        <span className="font-bold">Booth Genius</span>
        <span className="text-white/30 mx-2">|</span>
        <span className="text-sm text-white/70">Standard Template Designer</span>
      </div>
      <TemplateDesigner
        chrome="platform"
        templateId={templateId}
        initialScope="standard"
        backHref="/super-admin?tab=design-templates" backLabel="Back to Design Templates"
        editHref={id => '/super-admin/design-templates/' + id}
      />
    </div>
  );
}
