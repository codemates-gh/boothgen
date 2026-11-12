import { redirect } from 'next/navigation';

export default function GenieTemplateRedirect({ params, searchParams }: { params: { templateId: string }; searchParams: { scope?: string } }) {
  redirect('/templates/' + params.templateId + (searchParams.scope ? '?scope=' + encodeURIComponent(searchParams.scope) : ''));
}
