import { redirect } from 'next/navigation';

// Automations moved to Messages → Automations
export default function AutomationPage() { redirect('/messages/automations'); }
