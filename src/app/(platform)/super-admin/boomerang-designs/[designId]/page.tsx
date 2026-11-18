'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { Camera } from 'lucide-react';
import { TemplateDesigner } from '@/components/genie/TemplateDesigner';

// Super Admin → Boomerang Designs: BoothGen designs the Standard Boomerang designs operators pick from
export default function StandardBoomerangDesignerPage() {
  const { designId } = useParams<{ designId: string }>();
  const search = useSearchParams();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/>
        <span className="font-bold">BoothGen</span>
        <span className="text-white/30 mx-2">|</span>
        <span className="text-sm text-white/70">Standard Boomerang Designer</span>
      </div>
      <TemplateDesigner
        kind="clip"
        chrome="platform"
        templateId={designId}
        initialScope="standard"
        initialFormat={search.get('format')}
        backHref="/super-admin?tab=boomerang-designs" backLabel="Back to Boomerang Designs"
        editHref={id => '/super-admin/boomerang-designs/' + id}
      />
    </div>
  );
}
