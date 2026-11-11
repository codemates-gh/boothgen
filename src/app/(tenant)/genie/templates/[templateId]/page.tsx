'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { TemplateDesigner } from '@/components/genie/TemplateDesigner';

export default function TemplateDesignerPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const search = useSearchParams();
  return (
    <TemplateDesigner
      templateId={templateId}
      initialScope={search.get('scope') === 'standard' ? 'standard' : 'mine'}
      backHref="/genie/templates" backLabel="Back to Templates"
      editHref={id => '/genie/templates/' + id}
    />
  );
}
