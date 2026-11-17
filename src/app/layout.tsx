import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';


const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://boothgen.com'),
  title: {
    default: 'BoothGen: Photo Booth App and CRM',
    template: '%s | BoothGen',
  },
  description: 'The next generation of photo booths. Genie, the photo booth app, runs your booth: props, backdrops, boomerangs, instant sharing and live galleries, paid per event. Genius, the photo booth CRM, runs your business.',
  keywords: ['photo booth app', 'iPad photo booth app', 'photo booth CRM', 'photo booth software', 'photo booth business management', 'booth rental software', 'event photo booth platform'],
  robots: { index: true, follow: true },
  openGraph: {
    siteName: 'BoothGen',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
