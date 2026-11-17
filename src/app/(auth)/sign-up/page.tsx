import { prisma } from '@/lib/prisma/client';
import SignUpForm from './SignUpForm';


// ?product=genius signs up for the CRM; anything else (or nothing) is Genie, the default
export default async function SignUpPage(props: { searchParams: Promise<{ product?: string }> }) {
  const searchParams = await props.searchParams;
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['terms_content', 'privacy_content'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const hasTerms = !!(map.terms_content?.trim());
  const hasPrivacy = !!(map.privacy_content?.trim());
  const product = searchParams?.product === 'genius' || searchParams?.product === 'crm' ? 'genius' : 'genie';
  return <SignUpForm hasTerms={hasTerms} hasPrivacy={hasPrivacy} product={product} />;
}
