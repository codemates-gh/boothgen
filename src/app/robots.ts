import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/dashboard/',
          '/events',
          '/clients',
          '/leads',
          '/quotes',
          '/invoices',
          '/contracts',
          '/gallery',
          '/analytics',
          '/automation',
          '/settings',
          '/calendar',
          '/super-admin',
          '/onboarding',
          '/invite/',
          '/forgot-password',
          '/reset-password',
          '/embed/',
          '/portal/',
          '/g/',
        ],
      },
    ],
    sitemap: 'https://boothgen.com/sitemap.xml',
  };
}
