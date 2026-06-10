import type { Metadata } from 'next';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

export const metadata: Metadata = { title: 'Photo Booth CRM', description: 'Complete CRM for photo booth operators' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
