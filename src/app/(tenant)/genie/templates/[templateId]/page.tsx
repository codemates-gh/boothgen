import { redirect } from 'next/navigation';


export default async function GenieTemplateRedirect(
  props: { params: Promise<{ templateId: string }>; searchParams: Promise<{ scope?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  redirect('/templates/' + params.templateId + (searchParams.scope ? '?scope=' + encodeURIComponent(searchParams.scope) : ''));
}
