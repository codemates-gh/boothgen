import { redirect } from 'next/navigation';

// Moved to Genie → Sharing
export default function SettingsGenieRedirect() {
  redirect('/genie/sharing');
}
