'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { TemplateDesigner } from '@/components/genie/TemplateDesigner';

// My Boomerang designs: opened from an event's Genie tab (Boomerang → Frame → Design one / Edit), at the event's shape
export default function BoomerangDesignerPage() {
  const { designId } = useParams<{ designId: string }>();
  const search = useSearchParams();
  const eventId = search.get('event');
  const back = eventId ? `/events/${eventId}/genie` : '/templates';
  return (
    <TemplateDesigner
      kind="clip"
      templateId={designId}
      initialFormat={search.get('format')}
      backHref={back} backLabel={eventId ? 'Back to the event' : 'Back to Templates'}
      editHref={id => `/templates/boomerang/${id}${eventId ? '?event=' + eventId : ''}`}
    />
  );
}
