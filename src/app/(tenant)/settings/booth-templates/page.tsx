import { redirect } from 'next/navigation';

// Moved to Templates → Template Settings
export default function BoothTemplatesRedirect() {
  redirect('/templates/settings');
}
