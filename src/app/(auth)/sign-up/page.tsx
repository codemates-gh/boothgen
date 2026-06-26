import { prisma } from '@/lib/prisma/client';
import SignUpForm from './SignUpForm';

export default async function SignUpPage() {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['terms_content', 'privacy_content'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const hasTerms = !!(map.terms_content?.trim());
  const hasPrivacy = !!(map.privacy_content?.trim());
  return <SignUpForm hasTerms={hasTerms} hasPrivacy={hasPrivacy} />;
}
