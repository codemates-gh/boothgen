import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://boothgen.com'),
  title: {
    default: 'Booth Genius — CRM for Photo Booth Operators',
    template: '%s | Booth Genius',
  },
  description: 'Booth Genius is the all-in-one CRM for photo booth operators. Manage leads, quotes, contracts, invoices, photo galleries, and client portals — free to start.',
  keywords: ['photo booth CRM', 'photo booth software', 'photo booth business management', 'booth rental software', 'event photo booth platform'],
  robots: { index: true, follow: true },
  openGraph: {
    siteName: 'Booth Genius',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@boothgenius',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
