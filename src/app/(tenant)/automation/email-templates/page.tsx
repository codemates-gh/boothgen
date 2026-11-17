import { redirect } from 'next/navigation';

// Email templates moved to Messages → Templates
export default function EmailTemplatesPage() { redirect('/messages/templates'); }
