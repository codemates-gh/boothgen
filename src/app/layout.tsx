import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500'], display: 'swap' });

export const metadata: Metadata = { title: 'Booth Genius', description: 'Complete CRM for photo booth operators' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className}><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
