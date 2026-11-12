import { redirect } from 'next/navigation';

// Moved to Templates (not Genie-only)
export default function GenieTemplatesRedirect() {
  redirect('/templates');
}
