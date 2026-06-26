import { prisma } from '@/lib/prisma/client';
import SignUpForm from './SignUpForm';

export default async function SignUpPage() {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['terms_url', 'privacy_url'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return <SignUpForm termsUrl={map.terms_url ?? ''} privacyUrl={map.privacy_url ?? ''} />;
}
